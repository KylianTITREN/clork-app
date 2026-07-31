// Supabase Edge Function : publication d'un planning de magasin.
//
// Canal B2B : la responsable dépose l'Excel officiel sur le site, un parseur
// déterministe (zéro IA) en tire un ParsedPlanning, cette fonction l'écrit
// dans les `shifts` des employées inscrites et les prévient par push.
//
// Authentification : PAS de JWT utilisateur — la responsable n'a pas de compte
// Clork. Le couple (store_token, access_code) de la table `stores` fait foi.
// ⚠️ Déploiement : `supabase functions deploy publish-planning --no-verify-jwt`
// (sinon la passerelle refuse la requête avant d'atteindre ce code).
//
// Garanties de ce chemin :
//   · dry_run = aucune écriture, on ne renvoie que l'appariement (aperçu).
//   · Publication idempotente : republier la même semaine efface les créneaux
//     'import' et 'scan' de cette semaine puis réécrit. 'manual' n'est JAMAIS
//     touché — ce que l'employée a saisi à la main lui appartient.
//   · Appariement strictement 1↔1 : un nom ambigu n'est pas apparié plutôt que
//     mal apparié (un faux horaire est pire qu'un horaire absent).
//   · Logs sans nom complet ni horaire nominatif : des compteurs uniquement.
//
// CLOISONNEMENT PAR MAGASIN (store_members) :
//   L'appariement se fait d'abord sur `store_members.employee_name`, le nom de
//   ligne que la responsable a explicitement attribué à un compte lors d'une
//   confirmation (source "member"). Le rapprochement flou par display_name /
//   alias ne subsiste qu'en REPLI, et dès que le magasin compte au moins un
//   membre confirmé il ne sort JAMAIS de ce cercle : une homonyme d'un autre
//   magasin ne peut plus recevoir ces horaires. Un magasin sans aucun membre
//   confirmé (première semaine) garde l'ancien comportement, sinon personne ne
//   recevrait rien avant la première confirmation.
//
// LE CALQUE (store_planning_edits) :
//   La responsable imprime son Excel et le rature au stylo. La vérité n'est
//   donc pas le fichier mais son exemplaire annoté. On garde les deux couches
//   séparées : le SOCLE (dernier fichier déposé, store_imports.payload) et le
//   CALQUE (ses corrections). Une réimportation remplace le socle sans effacer
//   le calque. Ce qui est écrit dans `shifts`, c'est toujours socle + calque,
//   et les créneaux venus du calque portent `is_store_edit = true` (badge
//   « modifié » côté app).
//
// CORRIGER AVANT D'ENVOYER (`pre_publication`) :
//   Au tout premier dépôt, la responsable voit dans l'aperçu qu'une ligne est
//   fausse. Sa correction n'est alors PAS une rature : personne n'a encore vu
//   ce planning. Une correction enregistrée AVANT la première publication de
//   la semaine rejoint donc le SOCLE — `is_store_edit = false`, pas de badge,
//   pas de « tes horaires ont changé » (la première publication envoie de
//   toute façon le message d'arrivée). Après la première publication, c'est
//   une rature, comportement inchangé.
//   Le statut se fige à l'ENREGISTREMENT (`handleSaveEdit`) et n'est jamais
//   recalculé ensuite. Réenregistrer la même correction plus tard est un
//   nouveau geste, donc une nouvelle évaluation.
//
// Actions supportées (champ `action`, absent = publication) :
//   · verify_only     : le couple (lien, code) est-il valide ?
//   · dry_run         : aperçu de l'appariement, aucune écriture.
//   · confirm_members : la responsable attribue une ligne du fichier à chaque
//                       adhésion en attente.
//   · reassign_member : corrige l'attribution d'un membre déjà confirmé.
//   · list_weeks      : les semaines déjà publiées pour ce magasin.
//   · get_week        : l'état EFFECTIF d'une semaine (socle + calque).
//   · save_edit       : crée ou remplace une entrée du calque, et fige son
//                       statut (correction du socle ou rature).
//   · delete_edit     : retire une entrée du calque.
//   · apply_week      : réécrit + notifie sans nouveau dépôt de fichier.
//   · (défaut)        : publication réelle + infos de la semaine + push.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Un planning de 60 employées pèse ~100 ko : au-delà, ce n'est pas un planning. */
const MAX_BODY_BYTES = 1_000_000;
const MAX_EMPLOYEES = 60;
const DAYS_IN_WEEK = 7;
/** Contrainte SQL : shifts.break_minutes between 0 and 480. */
const MAX_BREAK_MINUTES = 480;

/** Repli quand le fichier ne precise pas la pause (decision Kylian). */
const DEFAULT_BREAK_RULE = { deduct_minutes: 60, above_hours: 6 } as const;
/** Pagination de la lecture des profils (appariement des noms). */
const PROFILE_PAGE_SIZE = 1000;
const PROFILE_MAX_PAGES = 20;
/** Lecture des profils des membres : `in(...)` par paquets, pour l'URL. */
const PROFILE_ID_CHUNK = 200;
/** Infos de la semaine jointes au dépôt. */
const MAX_NOTICES = 20;
const MAX_NOTICE_TITLE = 120;
const MAX_NOTICE_DETAIL = 500;
/** Nom de ligne attribué à une adhésion : une ligne de planning, pas un roman. */
const MAX_EMPLOYEE_NAME = 120;
/** Calque : garde-fous de volume. Une semaine raturée, pas un second planning. */
const MAX_EDITS_PER_WEEK = 200;
const MAX_EDIT_SHIFTS = 4;
/** list_weeks : la responsable regarde ses dernières semaines, pas son histoire. */
const MAX_LISTED_IMPORTS = 200;
const MAX_LISTED_WEEKS = 26;
const MAX_EDIT_ROWS_SCANNED = 1000;
/** Expo accepte 100 messages par requête. */
const PUSH_CHUNK_SIZE = 100;
/** Notification de changement : au-delà, on résume (« et N autres jours »). */
const MAX_CHANGES_IN_BODY = 2;
/** Temporisation sur échec d'authentification (frein à la force brute). */
const AUTH_FAILURE_DELAY_MS = 600;

const AUTH_ERROR = "Lien ou code d'accès invalide.";

// --- Contrat de données partagé avec le parseur -------------------------------

type ParsedShift = { start: string; end: string };

type ParsedDay = {
  day_index: number;
  date: string;
  status: "work" | "off";
  shifts: ParsedShift[];
  duration_hours: number | null;
};

type ParsedEmployee = {
  name: string;
  row_index: number;
  days: ParsedDay[];
  total_hours: number | null;
};

type ParsedPlanning = {
  store_label: string;
  week_start: string;
  week_number: number | null;
  break_rule: { deduct_minutes: number; above_hours: number } | null;
  employees: ParsedEmployee[];
  source_file_name: string;
};

/**
 * "member" : la responsable a elle-même attribué cette ligne à ce compte.
 * "name"   : repli par rapprochement de noms (display_name / alias).
 */
type MatchSource = "member" | "name";

type MatchedEmployee = {
  name: string;
  user_id: string;
  display_name: string;
  days_written: number;
  source: MatchSource;
};

type PendingMember = {
  user_id: string;
  display_name: string;
  joined_at: string;
};

/** Info de la semaine. date null = valable toute la semaine. */
type Notice = {
  date: string | null;
  title: string;
  detail: string | null;
};

type Assignment = { user_id: string; employee_name: string };

type StoreMemberRow = {
  user_id: string;
  employee_name: string | null;
  status: "pending" | "confirmed";
  created_at: string;
};

// --- Contrat du calque --------------------------------------------------------

/** Les seuls types de créneau qu'une rature peut produire. */
type EditShiftType = "work" | "meeting" | "training";

type EditShift = { start: string; end: string; type: EditShiftType };

type EditScope = "employee" | "team";
type TeamScope = "all" | "working" | "selection";
type EditAction = "set_day" | "add_shift";

/** Une entrée du calque, telle que stockée dans store_planning_edits. */
type PlanningEdit = {
  id: string;
  week_start: string;
  date: string;
  scope: EditScope;
  employee_name: string | null;
  team_scope: TeamScope | null;
  team_names: string[] | null;
  action: EditAction;
  shifts: EditShift[];
  /**
   * Correction enregistrée AVANT la première publication de la semaine : elle
   * fait partie du SOCLE et non des ratures. Ses créneaux sont écrits avec
   * `is_store_edit = false` (aucun badge « modifié », aucune notification de
   * changement). Figé à l'enregistrement, jamais recalculé.
   */
  pre_publication: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * Une entrée du calque telle qu'elle arrive du site : ni id, ni horodatage, ni
 * `pre_publication`. Ce dernier est une CONSTATATION du serveur (la semaine
 * était-elle déjà publiée ?), jamais une déclaration du site — sinon un appel
 * mal formé pourrait faire passer une rature pour une correction du socle et
 * priver une employée de son badge et de sa notification.
 */
type EditInput = Omit<PlanningEdit, "id" | "created_at" | "updated_at" | "pre_publication">;

/**
 * Les deux compteurs de l'aperçu. Un seul chiffre mentirait : « 3 modifications
 * conservées » pour des corrections que personne n'a jamais vues n'a aucun sens
 * pour la responsable.
 */
type EditCounts = { edit_count: number; pre_publication_count: number };

/** `edit_count` = les ratures. `pre_publication_count` = les corrections du socle. */
function countEdits(edits: readonly { pre_publication: boolean }[]): EditCounts {
  const preCount = edits.filter((edit) => edit.pre_publication).length;
  return { edit_count: edits.length - preCount, pre_publication_count: preCount };
}

// --- Réponses -----------------------------------------------------------------

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

function errorResponse(status: number, message: string): Response {
  return jsonResponse(status, { success: false, error: message });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Dates et heures ----------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidDate(iso: unknown): iso is string {
  if (typeof iso !== "string" || !DATE_RE.test(iso)) return false;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso;
}

function addDaysISO(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isMonday(iso: string): boolean {
  return new Date(`${iso}T00:00:00Z`).getUTCDay() === 1;
}

function weekDatesOf(weekStart: string): string[] {
  return Array.from({ length: DAYS_IN_WEEK }, (_, offset) => addDaysISO(weekStart, offset));
}

function minutesOf(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

const PARIS_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Paris",
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Décalage France (en minutes) à un instant donné : +120 en été, +60 en hiver. */
function parisOffsetMinutes(instant: Date): number {
  const parts = Object.fromEntries(
    PARIS_PARTS.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24, // certaines versions d'ICU rendent "24" pour minuit
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUTC - instant.getTime()) / 60000);
}

/**
 * "2026-07-27" + "09:30" → "2026-07-27T09:30:00+02:00".
 *
 * L'heure du planning est une heure de pendule française. Le décalage est
 * CALCULÉ pour la date concernée (et non figé à +02:00) : un planning de
 * novembre est en +01:00, et la semaine du changement d'heure ne dérive pas.
 */
function toParisTimestamp(dateISO: string, time: string): string {
  const [year, month, day] = dateISO.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  const naive = Date.UTC(year, month - 1, day, hours, minutes);
  // Deux passes : la première estime le décalage, la seconde le confirme sur
  // l'instant réel (utile aux nuits de bascule heure d'été / heure d'hiver).
  let offset = parisOffsetMinutes(new Date(naive));
  offset = parisOffsetMinutes(new Date(naive - offset * 60000));
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  return `${dateISO}T${time}:00${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

const PARIS_HOUR = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Horodatage stocké → heure de pendule française ("2026-07-31T17:00:00Z" → "19:00"). */
function parisTime(instant: number): string {
  return PARIS_HOUR.format(new Date(instant));
}

const FR_DATE = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

function frenchDate(iso: string): string {
  return FR_DATE.format(new Date(`${iso}T00:00:00Z`));
}

const FR_WEEKDAY = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  timeZone: "UTC",
});

/** "2026-07-29" → "Mercredi 29". C'est ainsi qu'on parle d'un jour à quelqu'un. */
function frenchWeekday(iso: string): string {
  const label = FR_WEEKDAY.format(new Date(`${iso}T00:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// --- Validation du corps de requête -------------------------------------------

type ValidationResult = { planning: ParsedPlanning } | { error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Champ optionnel du contrat : absent vaut null, jamais une erreur de format. */
function isNullableNumber(value: unknown): value is number | null | undefined {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function validateDay(day: unknown, weekStart: string, seen: Set<number>): string | null {
  if (!isRecord(day)) return "journée illisible";
  const { day_index: dayIndex, date, status, shifts, duration_hours: duration } = day;

  if (typeof dayIndex !== "number" || !Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) {
    return "day_index doit être un entier de 0 à 6";
  }
  if (seen.has(dayIndex)) return `jour ${dayIndex} en double`;
  seen.add(dayIndex);

  if (!isValidDate(date)) return `date invalide (jour ${dayIndex})`;
  if (date !== addDaysISO(weekStart, dayIndex)) {
    return `la date ${date} ne correspond pas au jour ${dayIndex} de la semaine`;
  }
  if (status !== "work" && status !== "off") return `statut inconnu (jour ${dayIndex})`;
  if (!isNullableNumber(duration) || (typeof duration === "number" && duration < 0)) {
    return `durée invalide (jour ${dayIndex})`;
  }
  if (!Array.isArray(shifts)) return `créneaux illisibles (jour ${dayIndex})`;
  if (status === "off" && shifts.length > 0) {
    return `jour ${dayIndex} marqué en repos mais porteur de créneaux`;
  }
  if (shifts.length > 4) return `trop de créneaux le jour ${dayIndex}`;

  for (const shift of shifts) {
    if (!isRecord(shift)) return `créneau illisible (jour ${dayIndex})`;
    const { start, end } = shift;
    if (typeof start !== "string" || !TIME_RE.test(start)) {
      return `heure d'arrivée invalide (jour ${dayIndex})`;
    }
    if (typeof end !== "string" || !TIME_RE.test(end)) {
      return `heure de départ invalide (jour ${dayIndex})`;
    }
    // Un départ avant l'arrivée est forcément une erreur de lecture du
    // fichier : mieux vaut le refuser bruyamment que publier un faux horaire.
    if (minutesOf(end) <= minutesOf(start)) {
      return `le départ doit être après l'arrivée (jour ${dayIndex})`;
    }
  }
  return null;
}

function validatePlanning(input: unknown): ValidationResult {
  if (!isRecord(input)) return { error: "Planning absent ou illisible." };

  const {
    store_label: storeLabel,
    week_start: weekStart,
    week_number: weekNumber,
    break_rule: breakRule,
    employees,
    source_file_name: sourceFileName,
  } = input;

  if (typeof storeLabel !== "string" || storeLabel.trim().length === 0) {
    return { error: "Le planning ne porte pas de nom de magasin." };
  }
  if (!isValidDate(weekStart)) {
    return { error: "La date de début de semaine est invalide." };
  }
  if (!isMonday(weekStart)) {
    return { error: "La semaine doit commencer un lundi." };
  }
  if (!isNullableNumber(weekNumber)) {
    return { error: "Le numéro de semaine est invalide." };
  }
  if (typeof sourceFileName !== "string" || sourceFileName.length === 0) {
    return { error: "Le nom du fichier source est manquant." };
  }
  if (breakRule !== null && breakRule !== undefined) {
    if (
      !isRecord(breakRule) ||
      typeof breakRule.deduct_minutes !== "number" ||
      typeof breakRule.above_hours !== "number" ||
      breakRule.deduct_minutes < 0 ||
      breakRule.above_hours < 0
    ) {
      return { error: "La règle de pause du planning est illisible." };
    }
  }
  if (!Array.isArray(employees) || employees.length === 0) {
    return { error: "Le planning ne contient aucune employée." };
  }
  if (employees.length > MAX_EMPLOYEES) {
    return { error: `Le planning dépasse ${MAX_EMPLOYEES} employées.` };
  }

  for (const employee of employees) {
    if (!isRecord(employee)) return { error: "Une ligne du planning est illisible." };
    const { name, row_index: rowIndex, days, total_hours: totalHours } = employee;
    if (typeof name !== "string" || name.trim().length === 0) {
      return { error: "Une ligne du planning est sans nom." };
    }
    if (typeof rowIndex !== "number" || !Number.isInteger(rowIndex) || rowIndex < 0) {
      return { error: `Ligne « ${name} » : numéro de ligne invalide.` };
    }
    if (!isNullableNumber(totalHours)) {
      return { error: `Ligne « ${name} » : total hebdomadaire invalide.` };
    }
    if (!Array.isArray(days) || days.length > DAYS_IN_WEEK) {
      return { error: `Ligne « ${name} » : jours illisibles.` };
    }
    const seen = new Set<number>();
    for (const day of days) {
      const dayError = validateDay(day, weekStart, seen);
      if (dayError) return { error: `Ligne « ${name} » : ${dayError}.` };
    }
  }

  return { planning: input as unknown as ParsedPlanning };
}

// --- Validation des infos de la semaine ---------------------------------------

type NoticesResult = { notices: Notice[] } | { error: string };

/**
 * Le champ est optionnel : absent ou null vaut « aucune info », jamais une
 * erreur. Une date hors de la semaine publiée est en revanche refusée — c'est
 * forcément une erreur de saisie, et l'info serait invisible côté employée.
 */
function validateNotices(input: unknown, weekDates: readonly string[]): NoticesResult {
  if (input === undefined || input === null) return { notices: [] };
  if (!Array.isArray(input)) return { error: "Les infos de la semaine sont illisibles." };
  if (input.length > MAX_NOTICES) {
    return { error: `Pas plus de ${MAX_NOTICES} infos pour une semaine.` };
  }

  const notices: Notice[] = [];
  for (const entry of input) {
    if (!isRecord(entry)) return { error: "Une info de la semaine est illisible." };
    const { date, title, detail } = entry;

    if (typeof title !== "string" || title.trim().length === 0) {
      return { error: "Une info de la semaine est sans titre." };
    }
    const cleanTitle = title.trim();
    if (cleanTitle.length > MAX_NOTICE_TITLE) {
      return { error: `Un titre dépasse ${MAX_NOTICE_TITLE} caractères.` };
    }

    let cleanDetail: string | null = null;
    if (detail !== null && detail !== undefined) {
      if (typeof detail !== "string") return { error: "Le détail d'une info est illisible." };
      const trimmed = detail.trim();
      if (trimmed.length > MAX_NOTICE_DETAIL) {
        return { error: `Un détail dépasse ${MAX_NOTICE_DETAIL} caractères.` };
      }
      cleanDetail = trimmed.length > 0 ? trimmed : null;
    }

    let cleanDate: string | null = null;
    if (date !== null && date !== undefined && date !== "") {
      if (!isValidDate(date) || !weekDates.includes(date)) {
        return { error: `Une info porte une date hors de la semaine publiée.` };
      }
      cleanDate = date;
    }

    notices.push({ date: cleanDate, title: cleanTitle, detail: cleanDetail });
  }
  return { notices };
}

// --- Validation des confirmations d'adhésion ----------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AssignmentsResult = { assignments: Assignment[] } | { error: string };

/** Nom de ligne propre : espaces normalisés, longueur bornée, lettres présentes. */
function cleanEmployeeName(value: unknown): { name: string } | { error: string } {
  if (typeof value !== "string") return { error: "Nom de ligne manquant." };
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length === 0) return { error: "Le nom de la ligne ne peut pas être vide." };
  if (name.length > MAX_EMPLOYEE_NAME) {
    return { error: `Un nom de ligne dépasse ${MAX_EMPLOYEE_NAME} caractères.` };
  }
  if (normalizeName(name).length === 0) return { error: `« ${name} » ne ressemble pas à un nom.` };
  return { name };
}

/**
 * On ne vérifie PAS que le nom figure dans un planning déjà déposé : la
 * responsable peut très bien confirmer son équipe avant son premier dépôt.
 * On vérifie seulement qu'il s'agit d'un nom plausible, et surtout qu'une même
 * ligne n'est pas attribuée à deux personnes (deux comptes recevraient alors
 * les mêmes horaires, et une employée n'en recevrait aucun).
 */
function validateAssignments(input: unknown): AssignmentsResult {
  if (!Array.isArray(input) || input.length === 0) {
    return { error: "Aucune personne à confirmer." };
  }
  if (input.length > MAX_EMPLOYEES) {
    return { error: `Pas plus de ${MAX_EMPLOYEES} confirmations à la fois.` };
  }

  const seenUsers = new Set<string>();
  const seenNames = new Set<string>();
  const assignments: Assignment[] = [];

  for (const entry of input) {
    if (!isRecord(entry)) return { error: "Une confirmation est illisible." };
    const { user_id: userId, employee_name: rawName } = entry;

    if (typeof userId !== "string" || !UUID_RE.test(userId)) {
      return { error: "Une confirmation ne désigne aucun compte valide." };
    }
    const cleaned = cleanEmployeeName(rawName);
    if ("error" in cleaned) return { error: cleaned.error };
    const name = cleaned.name;
    const key = normalizeName(name);

    if (seenUsers.has(userId)) return { error: "Un même compte apparaît deux fois." };
    if (seenNames.has(key)) return { error: `La ligne « ${name} » est attribuée deux fois.` };
    seenUsers.add(userId);
    seenNames.add(key);

    assignments.push({ user_id: userId, employee_name: name });
  }
  return { assignments };
}

// --- Validation d'une entrée du calque ----------------------------------------

type EditResult = { edit: EditInput } | { error: string };

const EDIT_TYPES: readonly EditShiftType[] = ["work", "meeting", "training"];

/**
 * Une rature est une donnée saisie à la main sur un site public : elle est
 * validée aussi strictement que le fichier lui-même. Un horaire à l'envers, un
 * jour hors semaine ou un périmètre incohérent ne doit jamais atteindre la base
 * — la contrainte SQL le refuserait de toute façon, mais avec un message
 * incompréhensible pour la responsable.
 */
function validateEditShifts(input: unknown, action: EditAction): { shifts: EditShift[] } | { error: string } {
  if (input === undefined || input === null) {
    if (action === "add_shift") return { error: "Cet ajout ne contient aucun créneau." };
    return { shifts: [] };
  }
  if (!Array.isArray(input)) return { error: "Les créneaux de la correction sont illisibles." };
  if (input.length === 0 && action === "add_shift") {
    return { error: "Cet ajout ne contient aucun créneau." };
  }
  if (input.length > MAX_EDIT_SHIFTS) {
    return { error: `Pas plus de ${MAX_EDIT_SHIFTS} créneaux pour une même journée.` };
  }

  const starts = new Set<string>();
  const shifts: EditShift[] = [];
  for (const entry of input) {
    if (!isRecord(entry)) return { error: "Un créneau de la correction est illisible." };
    const { start, end, type } = entry;
    if (typeof start !== "string" || !TIME_RE.test(start)) {
      return { error: "Heure d'arrivée invalide (format attendu : 09:00)." };
    }
    if (typeof end !== "string" || !TIME_RE.test(end)) {
      return { error: "Heure de départ invalide (format attendu : 18:00)." };
    }
    if (minutesOf(end) <= minutesOf(start)) {
      return { error: "Le départ doit être après l'arrivée." };
    }
    // Absent = travail : c'est le cas de très loin le plus fréquent, et le site
    // n'a pas à envoyer le champ pour un simple changement d'horaire.
    const cleanType = type === undefined || type === null ? "work" : type;
    if (typeof cleanType !== "string" || !EDIT_TYPES.includes(cleanType as EditShiftType)) {
      return { error: "Type de créneau inconnu (travail, réunion ou formation)." };
    }
    if (starts.has(start)) return { error: "Deux créneaux commencent à la même heure." };
    starts.add(start);
    shifts.push({ start, end, type: cleanType as EditShiftType });
  }
  return { shifts: sortShifts(shifts) };
}

function validateEdit(input: unknown): EditResult {
  if (!isRecord(input)) return { error: "Correction absente ou illisible." };

  const weekStart = input.week_start;
  if (!isValidDate(weekStart)) return { error: "La semaine de la correction est invalide." };
  if (!isMonday(weekStart)) return { error: "La semaine doit commencer un lundi." };

  const date = input.date;
  if (!isValidDate(date) || !weekDatesOf(weekStart).includes(date)) {
    return { error: "La correction porte une date hors de la semaine." };
  }

  const scope = input.scope;
  if (scope !== "employee" && scope !== "team") {
    return { error: "Périmètre de correction inconnu." };
  }
  const action = input.action;
  if (action !== "set_day" && action !== "add_shift") {
    return { error: "Type de correction inconnu." };
  }
  // Remplacer la journée de toute une équipe n'a pas de sens défini : on ne
  // laisse pas la responsable créer une correction qu'on ne saurait pas rejouer.
  if (scope === "team" && action === "set_day") {
    return { error: "Une correction pour toute l'équipe ne peut qu'ajouter un créneau." };
  }

  const parsedShifts = validateEditShifts(input.shifts, action);
  if ("error" in parsedShifts) return { error: parsedShifts.error };

  if (scope === "employee") {
    const cleaned = cleanEmployeeName(input.employee_name);
    if ("error" in cleaned) return { error: cleaned.error };
    return {
      edit: {
        week_start: weekStart,
        date,
        scope,
        employee_name: cleaned.name,
        team_scope: null,
        team_names: null,
        action,
        shifts: parsedShifts.shifts,
      },
    };
  }

  const teamScope = input.team_scope;
  if (teamScope !== "all" && teamScope !== "working" && teamScope !== "selection") {
    return { error: "Périmètre d'équipe inconnu." };
  }

  let teamNames: string[] | null = null;
  if (teamScope === "selection") {
    const raw = input.team_names;
    if (!Array.isArray(raw) || raw.length === 0) {
      return { error: "Aucune personne sélectionnée pour cette correction." };
    }
    if (raw.length > MAX_EMPLOYEES) {
      return { error: `Pas plus de ${MAX_EMPLOYEES} personnes pour une correction.` };
    }
    const seen = new Set<string>();
    const names: string[] = [];
    for (const value of raw) {
      const cleaned = cleanEmployeeName(value);
      if ("error" in cleaned) return { error: cleaned.error };
      const key = normalizeName(cleaned.name);
      if (seen.has(key)) continue; // doublon inoffensif : on le retire en silence
      seen.add(key);
      names.push(cleaned.name);
    }
    teamNames = names;
  }

  return {
    edit: {
      week_start: weekStart,
      date,
      scope,
      employee_name: null,
      team_scope: teamScope,
      team_names: teamNames,
      action,
      shifts: parsedShifts.shifts,
    },
  };
}

// --- Appariement des noms -----------------------------------------------------

/**
 * RÉPLIQUE EXACTE de normalizeName (src/lib/scan-service.ts) : minuscules,
 * accents retirés, tout ce qui n'est pas une lettre devient une espace, mots
 * triés. « COPIN Typhanie » et « typhanie copin » donnent la même clé.
 * Toute divergence avec la version app ferait diverger scan et import.
 */
function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

type ProfileRow = {
  id: string;
  display_name: string | null;
  employee_aliases: string[] | null;
  expo_push_token: string | null;
  notify_employer_planning: boolean | null;
};

type ProfileCandidate = { profile: ProfileRow; keys: string[] };

type EmployeeKey = { index: number; key: string; words: Set<string> };

/**
 * Ne retient que les paires SANS ambiguïté : une ligne du fichier qui pointe
 * deux profils, ou un profil revendiqué par deux lignes, n'est pas appariée du
 * tout. Envoyer les horaires de quelqu'un d'autre est le pire échec possible.
 */
function resolvePairs(
  employees: EmployeeKey[],
  candidates: ProfileCandidate[],
  tier: "exact" | "words",
): Map<number, ProfileRow> {
  const profilesByEmployee = new Map<number, ProfileRow[]>();
  const employeesByProfile = new Map<string, number[]>();

  for (const employee of employees) {
    for (const candidate of candidates) {
      const hit = candidate.keys.some((key) => {
        if (tier === "exact") return key === employee.key;
        const words = key.split(" ").filter(Boolean);
        return words.length > 0 && words.every((word) => employee.words.has(word));
      });
      if (!hit) continue;
      profilesByEmployee.set(employee.index, [
        ...(profilesByEmployee.get(employee.index) ?? []),
        candidate.profile,
      ]);
      employeesByProfile.set(candidate.profile.id, [
        ...(employeesByProfile.get(candidate.profile.id) ?? []),
        employee.index,
      ]);
    }
  }

  const pairs = new Map<number, ProfileRow>();
  for (const [employeeIndex, profiles] of profilesByEmployee) {
    if (profiles.length !== 1) continue;
    const profile = profiles[0];
    if ((employeesByProfile.get(profile.id) ?? []).length !== 1) continue;
    pairs.set(employeeIndex, profile);
  }
  return pairs;
}

function matchEmployees(
  employees: readonly ParsedEmployee[],
  profiles: readonly ProfileRow[],
  alreadyMatched: ReadonlySet<number> = new Set(),
): Map<number, ProfileRow> {
  const keyed: EmployeeKey[] = employees
    .map((employee, index) => {
      const key = normalizeName(employee.name);
      return { index, key, words: new Set(key.split(" ").filter(Boolean)) };
    })
    .filter((entry) => entry.key.length > 0 && !alreadyMatched.has(entry.index));

  const candidates: ProfileCandidate[] = profiles
    .map((profile) => ({
      profile,
      keys: [...(profile.employee_aliases ?? []), profile.display_name ?? ""]
        .filter((value) => typeof value === "string" && value.trim().length > 0)
        .map(normalizeName)
        .filter((key) => key.length > 0),
    }))
    .filter((candidate) => candidate.keys.length > 0);

  // Passe 1 : correspondance exacte. Passe 2 : inclusion de tous les mots de
  // l'alias (« COPIN T. » ne passera pas, « Typhanie » oui), sur ce qui reste.
  const exact = resolvePairs(keyed, candidates, "exact");
  const takenProfiles = new Set([...exact.values()].map((profile) => profile.id));
  const remainingEmployees = keyed.filter((entry) => !exact.has(entry.index));
  const remainingCandidates = candidates.filter(
    (candidate) => !takenProfiles.has(candidate.profile.id),
  );
  const loose = resolvePairs(remainingEmployees, remainingCandidates, "words");

  return new Map([...exact, ...loose]);
}

async function loadProfiles(service: SupabaseClient): Promise<ProfileRow[]> {
  const rows: ProfileRow[] = [];
  for (let page = 0; page < PROFILE_MAX_PAGES; page += 1) {
    const from = page * PROFILE_PAGE_SIZE;
    const { data, error } = await service
      .from("profiles")
      .select("id, display_name, employee_aliases, expo_push_token, notify_employer_planning")
      .order("id", { ascending: true })
      .range(from, from + PROFILE_PAGE_SIZE - 1);
    if (error) throw new Error("profiles read failed: " + error.message);
    const batch = (data ?? []) as ProfileRow[];
    rows.push(...batch);
    if (batch.length < PROFILE_PAGE_SIZE) return rows;
  }
  console.warn(
    `profile scan capped at ${PROFILE_MAX_PAGES * PROFILE_PAGE_SIZE} rows — matching may be partial`,
  );
  return rows;
}

// --- Adhésions au magasin -----------------------------------------------------

/** Adhésions vivantes du magasin. 'rejected' est volontairement ignoré. */
async function loadStoreMembers(
  service: SupabaseClient,
  storeId: string,
): Promise<StoreMemberRow[]> {
  const { data, error } = await service
    .from("store_members")
    .select("user_id, employee_name, status, created_at")
    .eq("store_id", storeId)
    .in("status", ["pending", "confirmed"])
    .order("created_at", { ascending: true });
  if (error) throw new Error("store_members read failed: " + error.message);
  return (data ?? []) as StoreMemberRow[];
}

async function loadProfilesByIds(
  service: SupabaseClient,
  ids: readonly string[],
): Promise<ProfileRow[]> {
  const rows: ProfileRow[] = [];
  for (let index = 0; index < ids.length; index += PROFILE_ID_CHUNK) {
    const chunk = ids.slice(index, index + PROFILE_ID_CHUNK);
    const { data, error } = await service
      .from("profiles")
      .select("id, display_name, employee_aliases, expo_push_token, notify_employer_planning")
      .in("id", chunk);
    if (error) throw new Error("profiles read failed: " + error.message);
    rows.push(...((data ?? []) as ProfileRow[]));
  }
  return rows;
}

type StoreContext = {
  members: StoreMemberRow[];
  confirmedMembers: StoreMemberRow[];
  pendingMembers: PendingMember[];
  profileById: Map<string, ProfileRow>;
};

/** L'équipe du magasin, telle qu'elle est connue au moment de l'appel. */
async function loadStoreContext(service: SupabaseClient, storeId: string): Promise<StoreContext> {
  const members = await loadStoreMembers(service, storeId);
  const profiles = await loadProfilesByIds(service, members.map((member) => member.user_id));
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  return {
    members,
    confirmedMembers: members.filter((member) => member.status === "confirmed"),
    pendingMembers: members
      .filter((member) => member.status === "pending")
      .map((member) => ({
        user_id: member.user_id,
        display_name: profileById.get(member.user_id)?.display_name ?? "",
        joined_at: member.created_at,
      })),
    profileById,
  };
}

/**
 * Appariement d'autorité : la responsable a désigné elle-même la ligne du
 * fichier qui correspond à ce compte. On exige quand même une correspondance
 * 1↔1 après normalisation — deux lignes homonymes dans le MÊME fichier, ou deux
 * membres portant le même nom de ligne, restent des situations non résolues
 * plutôt que des attributions au hasard.
 */
function matchByMemberName(
  employees: readonly ParsedEmployee[],
  members: readonly StoreMemberRow[],
): Map<number, string> {
  const membersByKey = new Map<string, string[]>();
  for (const member of members) {
    const key = normalizeName(member.employee_name ?? "");
    if (key.length === 0) continue;
    membersByKey.set(key, [...(membersByKey.get(key) ?? []), member.user_id]);
  }

  const rowsByKey = new Map<string, number[]>();
  employees.forEach((employee, index) => {
    const key = normalizeName(employee.name);
    if (key.length === 0) return;
    rowsByKey.set(key, [...(rowsByKey.get(key) ?? []), index]);
  });

  const pairs = new Map<number, string>();
  for (const [key, indexes] of rowsByKey) {
    const userIds = membersByKey.get(key);
    if (!userIds || userIds.length !== 1 || indexes.length !== 1) continue;
    pairs.set(indexes[0], userIds[0]);
  }
  return pairs;
}

type Pairing = {
  pairs: Map<number, ProfileRow>;
  sources: Map<number, MatchSource>;
  scopedToStore: boolean;
};

/** Appariement complet des lignes du fichier : adhésions d'abord, noms ensuite. */
async function pairFileRows(
  service: SupabaseClient,
  planning: ParsedPlanning,
  context: StoreContext,
): Promise<Pairing> {
  const pairs = new Map<number, ProfileRow>();
  const sources = new Map<number, MatchSource>();

  for (const [index, userId] of matchByMemberName(planning.employees, context.confirmedMembers)) {
    const profile = context.profileById.get(userId);
    // Profil supprimé entre-temps : l'adhésion est orpheline, on l'ignore.
    if (!profile) continue;
    pairs.set(index, profile);
    sources.set(index, "member");
  }

  // CLOISONNEMENT : dès que le magasin compte un membre confirmé, le repli par
  // nom ne regarde plus que ses membres — une homonyme d'un autre magasin ne
  // peut plus être appariée. Un magasin encore sans membre confirmé garde
  // l'ancien comportement, sinon sa première publication n'atteindrait personne.
  const scopedToStore = context.confirmedMembers.length > 0;
  const fallbackPool = scopedToStore
    ? context.confirmedMembers
      .map((member) => context.profileById.get(member.user_id))
      .filter((profile): profile is ProfileRow => profile !== undefined)
    : await loadProfiles(service);

  const takenProfileIds = new Set([...pairs.values()].map((profile) => profile.id));
  const fallbackProfiles = fallbackPool.filter((profile) => !takenProfileIds.has(profile.id));
  for (
    const [index, profile] of matchEmployees(
      planning.employees,
      fallbackProfiles,
      new Set(pairs.keys()),
    )
  ) {
    pairs.set(index, profile);
    sources.set(index, "name");
  }

  return { pairs, sources, scopedToStore };
}

// --- Lecture du calque --------------------------------------------------------

type PlanningEditRow = {
  id: string;
  week_start: string;
  date: string;
  scope: string;
  employee_name: string | null;
  team_scope: string | null;
  team_names: string[] | null;
  action: string;
  shifts: unknown;
  pre_publication: unknown;
  created_at: string;
  updated_at: string;
};

/** Défiance envers ce qui vient de la base : une ligne bancale est ignorée, pas fatale. */
function readEditShifts(value: unknown): EditShift[] {
  if (!Array.isArray(value)) return [];
  const shifts: EditShift[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const { start, end, type } = entry;
    if (typeof start !== "string" || !TIME_RE.test(start)) continue;
    if (typeof end !== "string" || !TIME_RE.test(end)) continue;
    if (minutesOf(end) <= minutesOf(start)) continue;
    const cleanType = EDIT_TYPES.includes(type as EditShiftType) ? (type as EditShiftType) : "work";
    shifts.push({ start, end, type: cleanType });
  }
  return sortShifts(shifts);
}

function toPlanningEdit(row: PlanningEditRow): PlanningEdit | null {
  if (row.scope !== "employee" && row.scope !== "team") return null;
  if (row.action !== "set_day" && row.action !== "add_shift") return null;
  const teamScope = row.team_scope;
  if (
    row.scope === "team" &&
    teamScope !== "all" && teamScope !== "working" && teamScope !== "selection"
  ) {
    return null;
  }
  return {
    id: row.id,
    week_start: row.week_start,
    date: row.date,
    scope: row.scope,
    employee_name: row.employee_name,
    team_scope: row.scope === "team" ? (teamScope as TeamScope) : null,
    team_names: row.team_names,
    action: row.action,
    shifts: readEditShifts(row.shifts),
    // Défaut prudent : ce qui n'est pas explicitement une correction du socle
    // est une rature. Se tromper dans ce sens laisse un badge et une
    // notification de trop ; l'inverse effacerait un changement d'horaire sous
    // les yeux de l'employée.
    pre_publication: row.pre_publication === true,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const EDIT_COLUMNS =
  "id, week_start, date, scope, employee_name, team_scope, team_names, action, shifts, " +
  "pre_publication, created_at, updated_at";

async function loadPlanningEdits(
  service: SupabaseClient,
  storeId: string,
  weekStart: string,
): Promise<PlanningEdit[]> {
  const { data, error } = await service
    .from("store_planning_edits")
    .select(EDIT_COLUMNS)
    .eq("store_id", storeId)
    .eq("week_start", weekStart)
    .order("created_at", { ascending: true })
    .limit(MAX_EDITS_PER_WEEK);
  if (error) throw new Error("store_planning_edits read failed: " + error.message);
  return ((data ?? []) as PlanningEditRow[])
    .map(toPlanningEdit)
    .filter((edit): edit is PlanningEdit => edit !== null);
}

/**
 * Unicité logique d'une rature : périmètre + personne + jour + forme. Enregistrer
 * deux fois la même correction doit REMPLACER, jamais empiler. Le nom passe par
 * normalizeName, donc « COPIN Typhanie » et « typhanie copin » sont la même
 * personne — la contrainte SQL, elle, est plus grossière et sert de filet.
 */
function editKey(edit: { scope: EditScope; employee_name: string | null; date: string; action: EditAction }): string {
  return `${edit.scope}|${normalizeName(edit.employee_name ?? "")}|${edit.date}|${edit.action}`;
}

// --- Application du calque ----------------------------------------------------

type EffectiveShift = {
  start: string;
  end: string;
  type: EditShiftType;
  /** Ce créneau vient du calque et non du fichier. */
  is_edit: boolean;
  /** ... et il a été saisi avant la première publication : il fait partie du socle. */
  pre_publication: boolean;
};

type EffectiveDay = {
  day_index: number;
  date: string;
  status: "work" | "off";
  shifts: EffectiveShift[];
  duration_hours: number | null;
  /** Le jour porte une correction, quelle qu'elle soit (aperçu du site). */
  edited: boolean;
  /**
   * ... et au moins une de ces corrections est antérieure à la première
   * publication. Indispensable pour le cas sans créneau : une journée barrée
   * avant envoi (`set_day` vide) n'a rien d'autre pour se distinguer d'une
   * journée barrée après.
   */
  pre_publication_edited: boolean;
  /** Les heures payées imprimées valent-elles encore ? Non dès qu'on touche au travail. */
  keeps_file_hours: boolean;
};

type EffectiveEmployee = {
  name: string;
  /** Index de la ligne dans le fichier, null pour une entrée née d'une correction. */
  row_index: number | null;
  /** Renseigné uniquement pour une entrée hors fichier (membre confirmé ciblé). */
  user_id: string | null;
  days: EffectiveDay[];
};

type EffectiveWeek = {
  employees: EffectiveEmployee[];
  /** Corrections qui ne visent personne de connu : à signaler à la responsable. */
  orphanEditIds: string[];
};

function sortShifts<T extends { start: string }>(shifts: readonly T[]): T[] {
  return [...shifts].sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
}

function emptyDays(weekDates: readonly string[]): EffectiveDay[] {
  return weekDates.map((date, dayIndex) => ({
    day_index: dayIndex,
    date,
    status: "off" as const,
    shifts: [],
    duration_hours: null,
    edited: false,
    pre_publication_edited: false,
    keeps_file_hours: true,
  }));
}

function daysFromFile(employee: ParsedEmployee, weekDates: readonly string[]): EffectiveDay[] {
  const byIndex = new Map(employee.days.map((day) => [day.day_index, day]));
  return weekDates.map((date, dayIndex) => {
    const source = byIndex.get(dayIndex);
    const shifts: EffectiveShift[] = source && source.status === "work"
      ? sortShifts(
        source.shifts.map((shift) => ({
          start: shift.start,
          end: shift.end,
          type: "work" as const,
          is_edit: false,
          pre_publication: false,
        })),
      )
      : [];
    return {
      day_index: dayIndex,
      date,
      status: shifts.length > 0 ? ("work" as const) : ("off" as const),
      shifts,
      duration_hours: source?.duration_hours ?? null,
      edited: false,
      pre_publication_edited: false,
      keeps_file_hours: true,
    };
  });
}

/**
 * CŒUR DU MODÈLE : on part du socle (le fichier), on applique les `set_day`
 * (qui remplacent intégralement la journée d'une personne — liste vide = repos),
 * puis les `add_shift` (qui ajoutent sans rien retirer).
 *
 * Une correction peut viser quelqu'un qui n'est PAS dans le fichier (un membre
 * confirmé oublié de l'Excel, ou une réunion pour toute l'équipe) : on crée
 * alors une entrée hors fichier, et on ne la conserve que si elle finit par
 * porter au moins un créneau — sinon la publication irait effacer la semaine
 * d'une personne à qui elle n'a rien à écrire.
 *
 * Rien n'est deviné : un nom ambigu (deux lignes homonymes) ou inconnu rend la
 * correction orpheline, elle est signalée plutôt qu'appliquée au hasard.
 */
function buildEffectiveWeek(
  planning: ParsedPlanning,
  weekDates: readonly string[],
  edits: readonly PlanningEdit[],
  confirmedMembers: readonly StoreMemberRow[],
): EffectiveWeek {
  const entries: EffectiveEmployee[] = [];
  const byKey = new Map<string, EffectiveEmployee>();
  const ambiguousKeys = new Set<string>();

  planning.employees.forEach((employee, index) => {
    const entry: EffectiveEmployee = {
      name: employee.name,
      row_index: index,
      user_id: null,
      days: daysFromFile(employee, weekDates),
    };
    entries.push(entry);
    const key = normalizeName(employee.name);
    if (key.length === 0) return;
    if (byKey.has(key)) {
      ambiguousKeys.add(key);
      return;
    }
    byKey.set(key, entry);
  });

  // Membres confirmés indexés par nom de ligne, homonymes exclus.
  const memberByKey = new Map<string, StoreMemberRow>();
  const ambiguousMembers = new Set<string>();
  for (const member of confirmedMembers) {
    const key = normalizeName(member.employee_name ?? "");
    if (key.length === 0) continue;
    if (memberByKey.has(key)) {
      ambiguousMembers.add(key);
      continue;
    }
    memberByKey.set(key, member);
  }
  for (const key of ambiguousMembers) memberByKey.delete(key);

  const ensureEntry = (key: string): EffectiveEmployee | null => {
    if (key.length === 0 || ambiguousKeys.has(key)) return null;
    const existing = byKey.get(key);
    if (existing) return existing;
    const member = memberByKey.get(key);
    if (!member || !member.employee_name) return null;
    const entry: EffectiveEmployee = {
      name: member.employee_name,
      row_index: null,
      user_id: member.user_id,
      days: emptyDays(weekDates),
    };
    entries.push(entry);
    byKey.set(key, entry);
    return entry;
  };

  const orphanEditIds: string[] = [];

  // 1. set_day — remplacement intégral de la journée.
  for (const edit of edits.filter((entry) => entry.action === "set_day")) {
    const dayIndex = weekDates.indexOf(edit.date);
    const entry = dayIndex < 0 ? null : ensureEntry(normalizeName(edit.employee_name ?? ""));
    if (!entry || dayIndex < 0) {
      orphanEditIds.push(edit.id);
      continue;
    }
    const shifts: EffectiveShift[] = sortShifts(
      edit.shifts.map((shift) => ({
        ...shift,
        is_edit: true,
        pre_publication: edit.pre_publication,
      })),
    );
    const day = entry.days[dayIndex];
    entry.days[dayIndex] = {
      ...day,
      status: shifts.length > 0 ? "work" : "off",
      shifts,
      edited: true,
      pre_publication_edited: day.pre_publication_edited || edit.pre_publication,
      keeps_file_hours: false,
    };
  }

  // 2. add_shift — ajout par-dessus le résultat précédent.
  for (const edit of edits.filter((entry) => entry.action === "add_shift")) {
    const dayIndex = weekDates.indexOf(edit.date);
    if (dayIndex < 0) {
      orphanEditIds.push(edit.id);
      continue;
    }
    const targets = resolveEditTargets(edit, dayIndex, entries, ensureEntry, confirmedMembers);
    if (targets.length === 0) {
      orphanEditIds.push(edit.id);
      continue;
    }
    for (const entry of targets) {
      const day = entry.days[dayIndex];
      const taken = new Set(day.shifts.map((shift) => shift.start));
      const added: EffectiveShift[] = edit.shifts
        .filter((shift) => !taken.has(shift.start))
        .map((shift) => ({ ...shift, is_edit: true, pre_publication: edit.pre_publication }));
      if (added.length === 0) continue;
      const shifts = sortShifts([...day.shifts, ...added]);
      entry.days[dayIndex] = {
        ...day,
        status: shifts.length > 0 ? "work" : "off",
        shifts,
        edited: true,
        pre_publication_edited: day.pre_publication_edited || edit.pre_publication,
        // Une réunion ajoutée ne fausse pas les heures payées imprimées ;
        // un créneau de travail ajouté, si.
        keeps_file_hours: day.keeps_file_hours && !added.some((shift) => shift.type === "work"),
      };
    }
  }

  // Une entrée née d'une correction et restée vide n'a rien à faire ici : la
  // publier reviendrait à effacer la semaine de quelqu'un pour rien.
  const employees = entries.filter(
    (entry) => entry.row_index !== null || entry.days.some((day) => day.shifts.length > 0),
  );
  return { employees, orphanEditIds };
}

function resolveEditTargets(
  edit: PlanningEdit,
  dayIndex: number,
  entries: readonly EffectiveEmployee[],
  ensureEntry: (key: string) => EffectiveEmployee | null,
  confirmedMembers: readonly StoreMemberRow[],
): EffectiveEmployee[] {
  if (edit.scope === "employee") {
    const entry = ensureEntry(normalizeName(edit.employee_name ?? ""));
    return entry ? [entry] : [];
  }

  if (edit.team_scope === "all") {
    // Tous les membres confirmés : les seules personnes dont on sait avec
    // certitude qu'elles appartiennent à cette équipe.
    const targets = confirmedMembers
      .map((member) => ensureEntry(normalizeName(member.employee_name ?? "")))
      .filter((entry): entry is EffectiveEmployee => entry !== null);
    return dedupeEntries(targets);
  }

  if (edit.team_scope === "working") {
    // Le socle a déjà été appliqué : « qui travaille ce jour-là » se lit
    // directement sur l'état courant.
    return [...entries].filter((entry) =>
      entry.days[dayIndex].shifts.some((shift) => shift.type === "work")
    );
  }

  const targets = (edit.team_names ?? [])
    .map((name) => ensureEntry(normalizeName(name)))
    .filter((entry): entry is EffectiveEmployee => entry !== null);
  return dedupeEntries(targets);
}

function dedupeEntries(entries: readonly EffectiveEmployee[]): EffectiveEmployee[] {
  const seen = new Set<EffectiveEmployee>();
  return entries.filter((entry) => {
    if (seen.has(entry)) return false;
    seen.add(entry);
    return true;
  });
}

// --- Construction des créneaux ------------------------------------------------

type ShiftRow = {
  user_id: string;
  date: string;
  start_at: string;
  end_at: string;
  type: EditShiftType;
  break_minutes: number;
  source: "import";
  is_edited: false;
  is_store_edit: boolean;
};

/**
 * Pause = amplitude (premier départ → dernier retour) moins les heures PAYÉES
 * imprimées sur le planning. Dès que le calque a touché au TRAVAIL de la
 * journée, cette durée imprimée ne veut plus rien dire : on retombe sur la
 * règle de pause du magasin. Sans règle, aucune pause n'est supposée.
 *
 * Seuls les créneaux de travail entrent dans le calcul : une réunion de 19h à
 * 20h n'ajoute pas une pause fictive de fin de journée.
 */
function breakMinutesForDay(day: EffectiveDay, planning: ParsedPlanning): number {
  const work = day.shifts.filter((shift) => shift.type === "work");
  if (work.length === 0) return 0;
  const span = Math.max(...work.map((shift) => minutesOf(shift.end))) -
    Math.min(...work.map((shift) => minutesOf(shift.start)));

  if (day.keeps_file_hours && day.duration_hours !== null) {
    const paid = Math.round(day.duration_hours * 60);
    return Math.min(Math.max(span - paid, 0), MAX_BREAK_MINUTES);
  }
  // Regle par defaut quand le fichier est muet. Leurs exports sont
  // incoherents : certains impriment les heures PAYEES dans la colonne Duree,
  // d autres l amplitude brute sans dire un mot de la pause. Sans repli, une
  // journee de 8 h etait publiee comme 8 h payees (vecu le 2026-07-31 : 5 h de
  // trop sur une semaine). L aperçu du site annonce la regle appliquee.
  const rule = planning.break_rule ?? DEFAULT_BREAK_RULE;
  return span > rule.above_hours * 60 ? Math.min(rule.deduct_minutes, MAX_BREAK_MINUTES) : 0;
}

function buildShiftRows(
  userId: string,
  employee: EffectiveEmployee,
  planning: ParsedPlanning,
): ShiftRow[] {
  return employee.days.flatMap((day) => {
    if (day.shifts.length === 0) return [];
    const breakMinutes = breakMinutesForDay(day, planning);
    // La pause déduite est portée par le premier créneau de TRAVAIL de la
    // journée : le total payé du jour reste juste quel que soit le découpage.
    let breakPlaced = false;
    return day.shifts.map((shift) => {
      const carries = !breakPlaced && shift.type === "work";
      if (carries) breakPlaced = true;
      return {
        user_id: userId,
        date: day.date,
        start_at: toParisTimestamp(day.date, shift.start),
        end_at: toParisTimestamp(day.date, shift.end),
        type: shift.type,
        break_minutes: carries ? breakMinutes : 0,
        source: "import" as const,
        is_edited: false as const,
        // Un créneau né d'une correction PRÉ-PUBLICATION fait partie du socle :
        // l'employée n'a jamais vu la version d'avant, il n'y a donc rien à
        // signaler. Seule une rature allume le badge « modifié ».
        is_store_edit: shift.is_edit && !shift.pre_publication,
      };
    });
  });
}

function daysWrittenOf(rows: readonly ShiftRow[]): number {
  return new Set(rows.map((row) => row.date)).size;
}

// --- Comparaison avant / après ------------------------------------------------

/** Un créneau réduit à ce qui se voit : jour, bornes, nature. */
type Slot = { date: string; start: number | null; end: number | null; type: string; label: string };

type ExistingShift = {
  date: string;
  start_at: string | null;
  end_at: string | null;
  type: string;
  source: string;
};

const TYPE_NOUNS: Record<string, string> = {
  meeting: "réunion",
  training: "formation",
  off: "repos",
  leave: "congé",
  cp: "congé",
  rh: "repos",
  rtt: "RTT",
  sick: "arrêt",
  absent: "absence",
  unpaid: "congé sans solde",
  overtime: "heures supp",
  opening: "ouverture",
  closing: "fermeture",
};

function slotLabel(start: number | null, end: number | null, type: string): string {
  if (start === null) return TYPE_NOUNS[type] ?? "créneau";
  if (end === null) return parisTime(start);
  return `${parisTime(start)}-${parisTime(end)}`;
}

function slotOfExisting(row: ExistingShift): Slot {
  const start = row.start_at ? new Date(row.start_at).getTime() : null;
  const end = row.end_at ? new Date(row.end_at).getTime() : null;
  return { date: row.date, start, end, type: row.type, label: slotLabel(start, end, row.type) };
}

function slotOfRow(row: ShiftRow): Slot {
  const start = new Date(row.start_at).getTime();
  const end = new Date(row.end_at).getTime();
  return { date: row.date, start, end, type: row.type, label: slotLabel(start, end, row.type) };
}

function slotKey(slot: Slot): string {
  return `${slot.date}|${slot.start ?? "-"}|${slot.end ?? "-"}|${slot.type}`;
}

function listLabels(slots: readonly Slot[]): string {
  return slots.slice(0, 2).map((slot) => slot.label).join(" et ");
}

/** « réunion ajoutée 19:00-20:00 », « créneau ajouté 09:00-12:00 ». */
function describeAdded(added: readonly Slot[]): string {
  const types = new Set(added.map((slot) => slot.type));
  if (types.size === 1 && !types.has("work")) {
    const noun = TYPE_NOUNS[added[0].type] ?? "créneau";
    return `${noun} ajoutée ${listLabels(added)}`;
  }
  return `${listLabels(added)} ajouté${added.length > 1 ? "s" : ""}`;
}

type DayChange = { date: string; text: string };

/**
 * Ce qui a bougé, jour par jour, dit comme on le dirait à voix haute. Les
 * créneaux inchangés (dont ceux saisis à la main, présents des deux côtés) se
 * neutralisent : on ne parle que de ce qui change vraiment.
 */
function describeChanges(
  before: readonly Slot[],
  after: readonly Slot[],
  weekDates: readonly string[],
): DayChange[] {
  const changes: DayChange[] = [];
  for (const date of weekDates) {
    const dayBefore = before.filter((slot) => slot.date === date);
    const dayAfter = after.filter((slot) => slot.date === date);
    const beforeKeys = new Set(dayBefore.map(slotKey));
    const afterKeys = new Set(dayAfter.map(slotKey));
    const removed = dayBefore.filter((slot) => !afterKeys.has(slotKey(slot)));
    const added = dayAfter.filter((slot) => !beforeKeys.has(slotKey(slot)));
    if (removed.length === 0 && added.length === 0) continue;

    let text: string;
    if (dayAfter.length === 0) {
      text = `repos au lieu de ${listLabels(dayBefore)}`;
    } else if (removed.length === 0) {
      text = describeAdded(added);
    } else if (added.length === 0) {
      text = `${listLabels(removed)} supprimé${removed.length > 1 ? "s" : ""}`;
    } else {
      text = `${listLabels(dayAfter)} au lieu de ${listLabels(dayBefore)}`;
    }
    changes.push({ date, text });
  }
  return changes;
}

// --- Écriture -----------------------------------------------------------------

type WriteOutcome = {
  daysWritten: number;
  skippedManual: number;
  changes: DayChange[];
  /** Aucun créneau publié n'existait : c'est une arrivée, pas un changement. */
  isFirstWeek: boolean;
};

/**
 * Remplace la semaine d'une employée. Les créneaux 'manual' survivent : ils ne
 * sont ni supprimés, ni écrasés — si l'un occupe déjà (date, heure de début),
 * la ligne du fichier est abandonnée pour ce créneau précis.
 *
 * L'état AVANT est lu en premier : c'est lui qui permet de dire à l'employée ce
 * qui a changé, et de se taire quand rien n'a bougé.
 */
async function writeWeek(
  service: SupabaseClient,
  userId: string,
  rows: readonly ShiftRow[],
  weekDates: readonly string[],
): Promise<WriteOutcome> {
  const { data: current, error: readError } = await service
    .from("shifts")
    .select("date, start_at, end_at, type, source")
    .eq("user_id", userId)
    .in("date", weekDates);
  if (readError) throw new Error("shifts read failed: " + readError.message);

  const existing = (current ?? []) as ExistingShift[];
  const replaced = existing.filter((row) => row.source === "import" || row.source === "scan");
  const kept = existing.filter((row) => row.source !== "import" && row.source !== "scan");

  const { error: deleteError } = await service
    .from("shifts")
    .delete()
    .eq("user_id", userId)
    .in("date", weekDates)
    .in("source", ["import", "scan"]);
  if (deleteError) throw new Error("shifts delete failed: " + deleteError.message);

  const busy = new Set(
    kept
      .filter((row) => row.start_at !== null)
      .map((row) => new Date(row.start_at as string).getTime()),
  );
  // La contrainte unique (user_id, date, start_at) refuse deux créneaux qui
  // démarrent à la même seconde : on dédoublonne le lot avant de le poser,
  // sinon un doublon dans le fichier ferait échouer TOUTE la ligne.
  const seenStarts = new Set<number>();
  const insertable = rows.filter((row) => {
    const instant = new Date(row.start_at).getTime();
    if (busy.has(instant) || seenStarts.has(instant)) return false;
    seenStarts.add(instant);
    return true;
  });
  const skippedManual = rows.filter((row) => busy.has(new Date(row.start_at).getTime())).length;

  if (insertable.length > 0) {
    const { error: insertError } = await service.from("shifts").insert(insertable);
    if (insertError) throw new Error("shifts insert failed: " + insertError.message);
  }

  const before = existing.map(slotOfExisting);
  const after = [...kept.map(slotOfExisting), ...insertable.map(slotOfRow)];

  return {
    daysWritten: daysWrittenOf(insertable),
    skippedManual,
    changes: describeChanges(before, after, weekDates),
    isFirstWeek: replaced.length === 0,
  };
}

// --- Notifications push (best-effort) -----------------------------------------

type PushMessage = { to: string; title: string; body: string; sound: "default" };

function isExpoToken(token: string | null | undefined): token is string {
  return typeof token === "string" && /^Expo(nent)?PushToken\[.+\]$/.test(token.trim());
}

/**
 * Best-effort absolu : une panne d'Expo ne doit jamais faire échouer une
 * publication déjà écrite en base — l'employée verra ses horaires en ouvrant
 * l'app, la notification n'est qu'un confort.
 */
async function sendPushNotifications(messages: readonly PushMessage[]): Promise<number> {
  let delivered = 0;
  for (let index = 0; index < messages.length; index += PUSH_CHUNK_SIZE) {
    const chunk = messages.slice(index, index + PUSH_CHUNK_SIZE);
    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(chunk),
      });
      if (!response.ok) {
        console.error(`expo push chunk rejected: HTTP ${response.status}`);
        continue;
      }
      const payload = (await response.json()) as { data?: { status?: string }[] };
      delivered += (payload.data ?? []).filter((ticket) => ticket?.status === "ok").length;
    } catch (error) {
      console.error("expo push chunk failed:", error);
    }
  }
  return delivered;
}

function arrivalMessage(token: string, weekStart: string, daysWritten: number): PushMessage {
  const days = daysWritten <= 1 ? `${daysWritten} jour travaillé` : `${daysWritten} jours travaillés`;
  return {
    to: token.trim(),
    title: "Ton planning de la semaine est arrivé",
    body: `Semaine du ${frenchDate(weekStart)} — ${days}`,
    sound: "default",
  };
}

/**
 * « Mercredi 29 : repos au lieu de 10:00-18:00 · Vendredi 31 : réunion ajoutée
 * 19:00-20:00 ». Une notification qui ne dit pas CE QUI a changé oblige à
 * ouvrir l'app pour comparer de tête : autant ne rien envoyer.
 */
function changeMessage(token: string, changes: readonly DayChange[]): PushMessage | null {
  if (changes.length === 0) return null;
  const shown = changes
    .slice(0, MAX_CHANGES_IN_BODY)
    .map((change) => `${frenchWeekday(change.date)} : ${change.text}`);
  const rest = changes.length - shown.length;
  const tail = rest === 0 ? "" : rest === 1 ? " et 1 autre jour" : ` et ${rest} autres jours`;
  return {
    to: token.trim(),
    title: "Tes horaires ont changé",
    body: `${shown.join(" · ")}${tail}`,
    sound: "default",
  };
}

function pushForOutcome(
  profile: ProfileRow | null,
  outcome: WriteOutcome,
  weekStart: string,
): PushMessage | null {
  // Préférence serveur : une employée peut couper cette notification depuis
  // Notifications. Absente (ancien profil) = on notifie.
  if (!profile || profile.notify_employer_planning === false) return null;
  if (!isExpoToken(profile.expo_push_token)) return null;
  if (outcome.isFirstWeek) {
    return outcome.daysWritten > 0
      ? arrivalMessage(profile.expo_push_token, weekStart, outcome.daysWritten)
      : null;
  }
  return changeMessage(profile.expo_push_token, outcome.changes);
}

// --- Semaine effective : préparation partagée ---------------------------------

type WriteTarget = {
  user_id: string;
  name: string;
  source: MatchSource;
  profile: ProfileRow | null;
  rows: ShiftRow[];
};

type PreparedWeek = {
  planning: ParsedPlanning;
  weekDates: string[];
  effective: EffectiveWeek;
  pairing: Pairing;
  unmatched: string[];
  targets: WriteTarget[];
};

/**
 * Socle + calque + appariement : tout ce qu'il faut pour prévisualiser OU pour
 * écrire. Les deux chemins partagent ce calcul, sans quoi l'aperçu finirait par
 * mentir sur ce qui sera publié.
 */
async function prepareWeek(
  service: SupabaseClient,
  planning: ParsedPlanning,
  edits: readonly PlanningEdit[],
  context: StoreContext,
): Promise<PreparedWeek> {
  const weekDates = weekDatesOf(planning.week_start);
  const pairing = await pairFileRows(service, planning, context);
  const effective = buildEffectiveWeek(planning, weekDates, edits, context.confirmedMembers);

  const unmatched = planning.employees
    .map((employee, index) => (pairing.pairs.has(index) ? null : employee.name))
    .filter((name): name is string => name !== null);

  // Regroupement par compte AVANT écriture : si une ligne du fichier et une
  // entrée née d'une correction désignaient le même compte, deux écritures
  // successives effaceraient la première. On fusionne les créneaux.
  const byUser = new Map<string, WriteTarget>();
  for (const entry of effective.employees) {
    let userId: string | null = null;
    let source: MatchSource = "member";
    let profile: ProfileRow | null = null;

    if (entry.row_index !== null) {
      const paired = pairing.pairs.get(entry.row_index);
      if (!paired) continue;
      userId = paired.id;
      profile = paired;
      source = pairing.sources.get(entry.row_index) ?? "name";
    } else if (entry.user_id) {
      userId = entry.user_id;
      profile = context.profileById.get(entry.user_id) ?? null;
    }
    if (!userId) continue;

    const rows = buildShiftRows(userId, entry, planning);
    const existing = byUser.get(userId);
    byUser.set(
      userId,
      existing
        ? { ...existing, rows: [...existing.rows, ...rows] }
        : { user_id: userId, name: entry.name, source, profile, rows },
    );
  }

  return { planning, weekDates, effective, pairing, unmatched, targets: [...byUser.values()] };
}

type PublishOutcome = {
  matched: MatchedEmployee[];
  notified: number;
  failures: number;
  skippedManual: number;
};

/** Écriture réelle de la semaine préparée, puis notifications ciblées. */
async function publishPreparedWeek(
  service: SupabaseClient,
  storeId: string,
  prepared: PreparedWeek,
): Promise<PublishOutcome> {
  const matched: MatchedEmployee[] = [];
  const messages: PushMessage[] = [];
  let failures = 0;
  let skippedManual = 0;

  for (const target of prepared.targets) {
    try {
      const outcome = await writeWeek(service, target.user_id, target.rows, prepared.weekDates);
      skippedManual += outcome.skippedManual;
      matched.push({
        name: target.name,
        user_id: target.user_id,
        display_name: target.profile?.display_name ?? "",
        days_written: outcome.daysWritten,
        source: target.source,
      });
      const message = pushForOutcome(target.profile, outcome, prepared.planning.week_start);
      if (message) messages.push(message);
    } catch (error) {
      // Jamais de nom dans les logs : la ligne du fichier suffit à retrouver
      // la personne dans le payload conservé par store_imports.
      failures += 1;
      console.error(`store ${storeId}: user write failed:`, error);
    }
  }

  const notified = await sendPushNotifications(messages);
  return { matched, notified, failures, skippedManual };
}

// --- Vue « semaine effective » pour le site -----------------------------------

function serializeWeek(prepared: PreparedWeek, edits: readonly PlanningEdit[]) {
  const userByRow = new Map<number, string>(
    [...prepared.pairing.pairs].map(([index, profile]) => [index, profile.id]),
  );
  return prepared.effective.employees.map((entry) => ({
    name: entry.name,
    row_index: entry.row_index,
    in_file: entry.row_index !== null,
    user_id: entry.row_index !== null
      ? userByRow.get(entry.row_index) ?? null
      : entry.user_id,
    days: entry.days.map((day) => ({
      day_index: day.day_index,
      date: day.date,
      status: day.status,
      edited: day.edited,
      pre_publication_edited: day.pre_publication_edited,
      duration_hours: day.duration_hours,
      shifts: day.shifts.map((shift) => ({
        start: shift.start,
        end: shift.end,
        type: shift.type,
        is_edit: shift.is_edit,
        pre_publication: shift.pre_publication,
      })),
    })),
    edits: edits.filter(
      (edit) =>
        edit.scope === "employee" &&
        normalizeName(edit.employee_name ?? "") === normalizeName(entry.name),
    ).map((edit) => edit.id),
  }));
}

// --- Journal des dépôts -------------------------------------------------------

type ImportRow = {
  id: string;
  week_start: string;
  source_file_name: string | null;
  payload: unknown;
  published_at: string | null;
  created_at: string;
};

async function loadLatestImport(
  service: SupabaseClient,
  storeId: string,
  weekStart: string,
): Promise<ImportRow | null> {
  const { data, error } = await service
    .from("store_imports")
    .select("id, week_start, source_file_name, payload, published_at, created_at")
    .eq("store_id", storeId)
    .eq("week_start", weekStart)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error("store_imports read failed: " + error.message);
  const rows = (data ?? []) as ImportRow[];
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Cette semaine est-elle DÉJÀ partie chez les employées ? C'est la seule
 * question qui décide du statut d'une correction (socle ou rature).
 *
 * On cherche N'IMPORTE QUEL dépôt daté, surtout pas le dernier. Deux pièges le
 * commandent :
 *   · un nouveau dépôt qui n'apparie personne laisse `published_at` à null,
 *     alors que le dépôt précédent, lui, a bel et bien été distribué ;
 *   · une employée appariée seulement au second passage ne change rien au fait
 *     que ses collègues ont déjà lu la semaine.
 * Se fier au dernier dépôt ferait passer une rature pour une correction du
 * socle — donc un badge « modifié » et une notification en moins sur des
 * horaires que les équipes avaient déjà en poche.
 */
async function hasPublishedWeek(
  service: SupabaseClient,
  storeId: string,
  weekStart: string,
): Promise<boolean> {
  const { data, error } = await service
    .from("store_imports")
    .select("id")
    .eq("store_id", storeId)
    .eq("week_start", weekStart)
    .not("published_at", "is", null)
    .limit(1);
  if (error) throw new Error("store_imports read failed: " + error.message);
  return (data ?? []).length > 0;
}

// --- Confirmation des adhésions -----------------------------------------------

type ConfirmOutcome = { confirmed: number } | { error: string };

/**
 * Second temps de la poignée de main : la responsable attribue à chaque
 * adhésion « en attente » la ligne de SON fichier qui lui correspond.
 *
 * Tout est vérifié contre CE magasin : un user_id qui n'a pas d'adhésion ici
 * n'est jamais touché (ni créé, ni confirmé ailleurs), et une ligne déjà tenue
 * par un autre membre confirmé est refusée — sinon deux comptes recevraient les
 * horaires de la même personne.
 *
 * Rejouable : renvoyer un lot déjà appliqué à l'identique ne produit ni erreur
 * ni double écriture, ce qui rend une reprise après coupure réseau sans danger.
 */
async function confirmMembers(
  service: SupabaseClient,
  storeId: string,
  assignments: readonly Assignment[],
): Promise<ConfirmOutcome> {
  const members = await loadStoreMembers(service, storeId);
  const byUser = new Map(members.map((member) => [member.user_id, member]));
  const takenNames = new Map(
    members
      .filter((member) => member.status === "confirmed" && member.employee_name)
      .map((member) => [normalizeName(member.employee_name as string), member.user_id]),
  );

  // Aucune écriture avant que TOUT le lot soit validé : une confirmation à
  // moitié appliquée serait plus difficile à rattraper qu'un refus net.
  const toApply: Assignment[] = [];
  let alreadyDone = 0;
  for (const assignment of assignments) {
    const existing = byUser.get(assignment.user_id);
    // 'rejected' n'est pas chargé : une adhésion close est traitée comme absente.
    if (!existing) {
      return { error: "Une des personnes ne demande pas (ou plus) à rejoindre ce magasin." };
    }
    if (existing.status === "confirmed") {
      // Rejeu du même lot (réseau coupé au milieu, double clic) : sans effet,
      // et surtout pas une erreur — sinon la responsable serait bloquée.
      if (normalizeName(existing.employee_name ?? "") === normalizeName(assignment.employee_name)) {
        alreadyDone += 1;
        continue;
      }
      return {
        error: `Ce compte est déjà confirmé sur « ${existing.employee_name} ». ` +
          "Utilise la correction d'attribution pour le changer.",
      };
    }
    const owner = takenNames.get(normalizeName(assignment.employee_name));
    if (owner && owner !== assignment.user_id) {
      return { error: `La ligne « ${assignment.employee_name} » est déjà attribuée.` };
    }
    toApply.push(assignment);
  }

  const confirmedAt = new Date().toISOString();
  let confirmed = alreadyDone;
  for (const assignment of toApply) {
    // Le filtre status='pending' est reconduit dans l'UPDATE : deux onglets
    // ouverts en parallèle ne peuvent pas réécrire une adhésion déjà confirmée.
    const { data, error } = await service
      .from("store_members")
      .update({
        employee_name: assignment.employee_name,
        status: "confirmed",
        confirmed_at: confirmedAt,
      })
      .eq("store_id", storeId)
      .eq("user_id", assignment.user_id)
      .eq("status", "pending")
      .select("user_id");
    if (error) throw new Error("store_members update failed: " + error.message);
    confirmed += (data ?? []).length;
  }
  return { confirmed };
}

/**
 * Correction d'attribution : « en fait ce compte, c'est Sofia, pas Typhanie ».
 * confirm_members refuse par construction de toucher un compte déjà confirmé —
 * c'est ce qui rendait une erreur d'attribution impossible à réparer depuis le
 * site. Les garanties restent les mêmes : la ligne visée ne doit pas être tenue
 * par un AUTRE membre confirmé, sinon deux comptes recevraient les mêmes
 * horaires.
 *
 * Ne réécrit AUCUN créneau : la responsable renvoie la semaine (apply_week)
 * quand elle a fini de corriger l'équipe.
 */
async function reassignMember(
  service: SupabaseClient,
  storeId: string,
  userId: string,
  employeeName: string,
): Promise<{ changed: boolean } | { error: string }> {
  const members = await loadStoreMembers(service, storeId);
  const target = members.find((member) => member.user_id === userId);
  if (!target) {
    return { error: "Cette personne ne fait pas partie de ce magasin." };
  }

  const key = normalizeName(employeeName);
  const owner = members.find(
    (member) =>
      member.user_id !== userId &&
      member.status === "confirmed" &&
      normalizeName(member.employee_name ?? "") === key,
  );
  if (owner) {
    return { error: `La ligne « ${employeeName} » est déjà attribuée à quelqu'un d'autre.` };
  }

  // Rejeu à l'identique : rien à faire, et surtout pas une erreur.
  if (target.status === "confirmed" && normalizeName(target.employee_name ?? "") === key) {
    return { changed: false };
  }

  const { error } = await service
    .from("store_members")
    .update({
      employee_name: employeeName,
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    })
    .eq("store_id", storeId)
    .eq("user_id", userId);
  if (error) throw new Error("store_members update failed: " + error.message);
  return { changed: true };
}

// --- Point d'entrée -----------------------------------------------------------

type StoreRow = { id: string; label: string; access_code: string; join_code: string };

async function authenticateStore(
  service: SupabaseClient,
  storeToken: string,
  accessCode: string,
): Promise<StoreRow | null> {
  const { data, error } = await service
    .from("stores")
    .select("id, label, access_code, join_code")
    .eq("access_token", storeToken)
    .eq("is_active", true)
    .maybeSingle();
  if (error) {
    console.error("store lookup failed:", error.message);
    return null;
  }
  const store = data as StoreRow | null;
  // Même chemin d'échec (et même temporisation) que le token inconnu : la
  // réponse ne dit jamais lequel des deux facteurs est faux.
  if (!store || store.access_code.trim().toUpperCase() !== accessCode.trim().toUpperCase()) {
    return null;
  }
  return store;
}

const ACTIONS = [
  "confirm_members",
  "reassign_member",
  "list_weeks",
  "get_week",
  "save_edit",
  "delete_edit",
  "apply_week",
] as const;

type Action = typeof ACTIONS[number];

async function loadNotices(
  service: SupabaseClient,
  storeId: string,
  weekStart: string,
): Promise<Notice[]> {
  const { data, error } = await service
    .from("store_notices")
    .select("date, title, detail")
    .eq("store_id", storeId)
    .eq("week_start", weekStart)
    .order("date", { ascending: true, nullsFirst: true })
    .limit(MAX_NOTICES);
  if (error) throw new Error("store_notices read failed: " + error.message);
  return (data ?? []) as Notice[];
}

// --- Actions de lecture -------------------------------------------------------

/** Les semaines déjà publiées, la plus récente d'abord. */
async function handleListWeeks(service: SupabaseClient, storeId: string): Promise<Response> {
  const { data, error } = await service
    .from("store_imports")
    .select("week_start, published_at, created_at, matched")
    .eq("store_id", storeId)
    .order("week_start", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(MAX_LISTED_IMPORTS);
  if (error) throw new Error("store_imports read failed: " + error.message);

  // Les semaines les plus récentes d'abord : si le magasin a des années de
  // ratures derrière lui, c'est le haut de la liste qui doit rester juste.
  const { data: editData, error: editError } = await service
    .from("store_planning_edits")
    .select("week_start, pre_publication")
    .eq("store_id", storeId)
    .order("week_start", { ascending: false })
    .limit(MAX_EDIT_ROWS_SCANNED);
  if (editError) throw new Error("store_planning_edits read failed: " + editError.message);

  // Deux compteurs distincts : les ratures d'un côté, les corrections faites
  // avant le premier envoi de l'autre. Les mélanger annoncerait « N
  // modifications » sur une semaine que personne n'a jamais vue autrement.
  const editCount = new Map<string, number>();
  const preCount = new Map<string, number>();
  for (const row of (editData ?? []) as { week_start: string; pre_publication: boolean | null }[]) {
    const target = row.pre_publication === true ? preCount : editCount;
    target.set(row.week_start, (target.get(row.week_start) ?? 0) + 1);
  }

  // Une semaine peut avoir été déposée plusieurs fois : seule la dernière
  // compte, et l'ordre de la requête la place en tête de son groupe.
  const seen = new Set<string>();
  const weeks: Record<string, unknown>[] = [];
  for (const row of (data ?? []) as { week_start: string; published_at: string | null; matched: unknown }[]) {
    if (seen.has(row.week_start)) continue;
    seen.add(row.week_start);
    weeks.push({
      week_start: row.week_start,
      published_at: row.published_at,
      employee_count: Array.isArray(row.matched) ? row.matched.length : 0,
      edit_count: editCount.get(row.week_start) ?? 0,
      pre_publication_count: preCount.get(row.week_start) ?? 0,
    });
    if (weeks.length >= MAX_LISTED_WEEKS) break;
  }

  return jsonResponse(200, { success: true, weeks });
}

/** L'état EFFECTIF d'une semaine : le fichier tel que le calque le corrige. */
async function handleGetWeek(
  service: SupabaseClient,
  store: StoreRow,
  weekStart: string,
): Promise<Response> {
  const latest = await loadLatestImport(service, store.id, weekStart);
  if (!latest) {
    return errorResponse(404, "Aucun planning n'a encore été déposé pour cette semaine.");
  }
  const validation = validatePlanning(latest.payload);
  if ("error" in validation) {
    console.error(`store ${store.id}: stored payload rejected for ${weekStart}: ${validation.error}`);
    return errorResponse(422, "Le planning enregistré pour cette semaine est illisible.");
  }

  const [context, edits, notices] = await Promise.all([
    loadStoreContext(service, store.id),
    loadPlanningEdits(service, store.id, weekStart),
    loadNotices(service, store.id, weekStart),
  ]);
  const prepared = await prepareWeek(service, validation.planning, edits, context);

  const matched: MatchedEmployee[] = prepared.targets.map((target) => ({
    name: target.name,
    user_id: target.user_id,
    display_name: target.profile?.display_name ?? "",
    days_written: daysWrittenOf(target.rows),
    source: target.source,
  }));

  return jsonResponse(200, {
    success: true,
    week_start: weekStart,
    week_number: validation.planning.week_number,
    break_rule: validation.planning.break_rule,
    source_file_name: latest.source_file_name,
    published_at: latest.published_at,
    imported_at: latest.created_at,
    employees: serializeWeek(prepared, edits),
    // Chaque entrée porte son `pre_publication` : le site distingue « corrigé
    // avant envoi » de « modifié après ».
    edits,
    orphan_edit_ids: prepared.effective.orphanEditIds,
    ...countEdits(edits),
    matched,
    unmatched: prepared.unmatched,
    pending_members: context.pendingMembers,
    notices,
  });
}

// --- Actions d'écriture du calque ---------------------------------------------

async function handleSaveEdit(
  service: SupabaseClient,
  storeId: string,
  edit: EditInput,
): Promise<Response> {
  const existing = await loadPlanningEdits(service, storeId, edit.week_start);
  const key = editKey(edit);
  const duplicates = existing.filter((entry) => editKey(entry) === key).map((entry) => entry.id);

  if (existing.length - duplicates.length >= MAX_EDITS_PER_WEEK) {
    return errorResponse(409, `Pas plus de ${MAX_EDITS_PER_WEEK} corrections pour une semaine.`);
  }

  // LE STATUT SE DÉCIDE ICI, une fois pour toutes. Tant que la semaine n'est
  // pas partie, corriger une ligne fausse revient à corriger le fichier :
  // la correction rejoint le socle. Après, c'est une rature.
  //
  // Volontairement calculé maintenant, et non repris de l'entrée remplacée :
  // réenregistrer une correction est un NOUVEAU geste de la responsable, et il
  // s'évalue dans le monde tel qu'il est au moment où elle le fait. Les entrées
  // déjà en base, elles, ne sont jamais réévaluées.
  const prePublication = !(await hasPublishedWeek(service, storeId, edit.week_start));

  if (duplicates.length > 0) {
    const { error } = await service
      .from("store_planning_edits")
      .delete()
      .eq("store_id", storeId)
      .in("id", duplicates);
    if (error) throw new Error("store_planning_edits delete failed: " + error.message);
  }

  const now = new Date().toISOString();
  const { data, error } = await service
    .from("store_planning_edits")
    .insert({
      store_id: storeId,
      week_start: edit.week_start,
      date: edit.date,
      scope: edit.scope,
      employee_name: edit.employee_name,
      team_scope: edit.team_scope,
      team_names: edit.team_names,
      action: edit.action,
      shifts: edit.shifts,
      pre_publication: prePublication,
      // created_at conservé à la première saisie n'apporterait rien : une
      // correction remplacée est une nouvelle correction.
      created_at: now,
      updated_at: now,
    })
    .select(EDIT_COLUMNS)
    .single();
  if (error) throw new Error("store_planning_edits insert failed: " + error.message);

  const saved = toPlanningEdit(data as PlanningEditRow);
  // Compté sur `prePublication` et non sur `saved` : toPlanningEdit peut
  // refuser une ligne bancale, le compteur doit rester juste quand même.
  const kept = existing.filter((entry) => !duplicates.includes(entry.id));
  return jsonResponse(200, {
    success: true,
    edit: saved,
    replaced: duplicates.length,
    ...countEdits([...kept, { pre_publication: prePublication }]),
  });
}

async function handleDeleteEdit(
  service: SupabaseClient,
  storeId: string,
  editId: string,
): Promise<Response> {
  // Le filtre store_id est indispensable : un identifiant deviné ne doit pas
  // permettre de supprimer la correction d'un autre magasin.
  const { data, error } = await service
    .from("store_planning_edits")
    .delete()
    .eq("store_id", storeId)
    .eq("id", editId)
    .select("id, week_start");
  if (error) throw new Error("store_planning_edits delete failed: " + error.message);

  const deleted = (data ?? []) as { id: string; week_start: string }[];
  if (deleted.length === 0) {
    return errorResponse(404, "Cette correction n'existe plus.");
  }
  return jsonResponse(200, { success: true, deleted: deleted.length });
}

/**
 * « Envoyer les modifications » : on réécrit la semaine à partir du dernier
 * fichier déposé et du calque, sans redemander le fichier. C'est le geste qui
 * suit une rature.
 */
async function handleApplyWeek(
  service: SupabaseClient,
  store: StoreRow,
  weekStart: string,
): Promise<Response> {
  const latest = await loadLatestImport(service, store.id, weekStart);
  if (!latest) {
    return errorResponse(404, "Aucun planning n'a encore été déposé pour cette semaine.");
  }
  const validation = validatePlanning(latest.payload);
  if ("error" in validation) {
    console.error(`store ${store.id}: stored payload rejected for ${weekStart}: ${validation.error}`);
    return errorResponse(422, "Le planning enregistré pour cette semaine est illisible.");
  }

  const context = await loadStoreContext(service, store.id);
  const edits = await loadPlanningEdits(service, store.id, weekStart);
  const prepared = await prepareWeek(service, validation.planning, edits, context);
  const outcome = await publishPreparedWeek(service, store.id, prepared);

  // Pas de nouvelle ligne de journal : il n'y a pas eu de dépôt. On date la
  // dernière publication pour que la liste des semaines reste honnête.
  if (outcome.matched.length > 0) {
    const { error } = await service
      .from("store_imports")
      .update({ published_at: new Date().toISOString(), matched: outcome.matched })
      .eq("id", latest.id);
    if (error) console.error(`store ${store.id}: store_imports update failed:`, error.message);
  }

  const counts = countEdits(edits);
  console.log(
    `store ${store.id} apply week ${weekStart}: ` +
      `${outcome.matched.length} matched, ${prepared.unmatched.length} unmatched, ` +
      `${outcome.failures} failed, ${outcome.skippedManual} shift(s) kept manual, ` +
      `${outcome.notified} notified, ${counts.edit_count} edit(s), ` +
      `${counts.pre_publication_count} pre-publication`,
  );

  const body = {
    week_start: weekStart,
    matched: outcome.matched,
    unmatched: prepared.unmatched,
    pending_members: context.pendingMembers,
    notified: outcome.notified,
    ...counts,
  };

  if (outcome.failures > 0) {
    return jsonResponse(207, {
      success: false,
      error: `${outcome.matched.length} planning(s) mis à jour, ${outcome.failures} en échec. ` +
        "Réessaie : l'envoi est sans risque, il remplace la semaine.",
      ...body,
    });
  }
  return jsonResponse(200, { success: true, ...body });
}

// --- Serveur ------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return errorResponse(405, "Méthode non autorisée.");
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return errorResponse(413, "Fichier trop volumineux pour être publié.");
  }

  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) throw new Error("not an object");
    body = parsed;
  } catch {
    return errorResponse(400, "Requête illisible.");
  }

  const storeToken = body.store_token;
  const accessCode = body.access_code;
  const dryRun = body.dry_run === true;

  if (typeof storeToken !== "string" || storeToken.length === 0 || storeToken.length > 200) {
    return errorResponse(400, "Lien de dépôt manquant ou invalide.");
  }
  if (typeof accessCode !== "string" || accessCode.trim().length === 0 || accessCode.length > 32) {
    return errorResponse(400, "Code d'accès manquant.");
  }

  // Verification d acces seule (ecran du code, avant tout depot) : sans ce
  // mode, le site devait envoyer un planning bidon juste pour tester le code
  // et l utilisatrice recevait une erreur de validation parlant du planning.
  const verifyOnly = body.verify_only === true;

  const rawAction = body.action;
  if (
    rawAction !== undefined && rawAction !== null &&
    !(typeof rawAction === "string" && (ACTIONS as readonly string[]).includes(rawAction))
  ) {
    return errorResponse(400, "Action inconnue.");
  }
  const action = (rawAction ?? null) as Action | null;

  // --- Validation propre à chaque action, AVANT toute lecture en base --------
  let assignments: readonly Assignment[] = [];
  if (action === "confirm_members") {
    const parsed = validateAssignments(body.assignments);
    if ("error" in parsed) return errorResponse(400, parsed.error);
    assignments = parsed.assignments;
  }

  let reassignUserId = "";
  let reassignName = "";
  if (action === "reassign_member") {
    const rawUserId = body.user_id;
    if (typeof rawUserId !== "string" || !UUID_RE.test(rawUserId)) {
      return errorResponse(400, "Aucun compte valide à corriger.");
    }
    const cleaned = cleanEmployeeName(body.employee_name);
    if ("error" in cleaned) return errorResponse(400, cleaned.error);
    reassignUserId = rawUserId;
    reassignName = cleaned.name;
  }

  let weekStartParam = "";
  if (action === "get_week" || action === "apply_week") {
    const rawWeekStart = body.week_start;
    if (!isValidDate(rawWeekStart) || !isMonday(rawWeekStart)) {
      return errorResponse(400, "Semaine invalide (elle doit commencer un lundi).");
    }
    weekStartParam = rawWeekStart;
  }

  let editInput: EditInput | null = null;
  if (action === "save_edit") {
    const parsed = validateEdit(body.edit);
    if ("error" in parsed) return errorResponse(400, parsed.error);
    editInput = parsed.edit;
  }

  let editId = "";
  if (action === "delete_edit") {
    const rawEditId = body.edit_id;
    if (typeof rawEditId !== "string" || !UUID_RE.test(rawEditId)) {
      return errorResponse(400, "Aucune correction valide à retirer.");
    }
    editId = rawEditId;
  }

  // Seule la publication (et son aperçu) porte un planning : valider les autres
  // modes contre le contrat du planning renverrait une erreur incompréhensible.
  const skipPlanning = verifyOnly || action !== null;
  const validation = skipPlanning ? null : validatePlanning(body.planning);
  if (validation && "error" in validation) {
    return errorResponse(400, validation.error);
  }

  // Les infos de la semaine sont validées AVANT toute écriture : une date hors
  // semaine ne doit pas être découverte après que les créneaux sont posés.
  const weekDates = validation ? weekDatesOf(validation.planning.week_start) : [];
  let notices: Notice[] = [];
  if (validation) {
    const parsedNotices = validateNotices(body.notices, weekDates);
    if ("error" in parsedNotices) return errorResponse(400, parsedNotices.error);
    notices = parsedNotices.notices;
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured");
    return errorResponse(500, "Service de publication indisponible.");
  }
  const service = createClient(supabaseUrl, serviceKey);

  const store = await authenticateStore(service, storeToken, accessCode);
  if (!store) {
    // Frein élémentaire à la force brute : sans état, mais suffisant face à un
    // code de 6 caractères qui exige déjà de connaître le lien de dépôt.
    await sleep(AUTH_FAILURE_DELAY_MS);
    return errorResponse(401, AUTH_ERROR);
  }

  if (verifyOnly) {
    return jsonResponse(200, {
      success: true,
      store: { label: store.label, join_code: store.join_code },
    });
  }

  if (action === "confirm_members") {
    let outcome: ConfirmOutcome;
    try {
      outcome = await confirmMembers(service, store.id, assignments);
    } catch (error) {
      console.error(`store ${store.id}: confirm_members failed:`, error);
      return errorResponse(500, "Impossible d'enregistrer les confirmations.");
    }
    if ("error" in outcome) return errorResponse(409, outcome.error);
    console.log(
      `store ${store.id} confirm_members: ${assignments.length} requested, ${outcome.confirmed} confirmed`,
    );
    return jsonResponse(200, { success: true, confirmed: outcome.confirmed });
  }

  if (action === "reassign_member") {
    try {
      const outcome = await reassignMember(service, store.id, reassignUserId, reassignName);
      if ("error" in outcome) return errorResponse(409, outcome.error);
      console.log(`store ${store.id} reassign_member: changed=${outcome.changed}`);
      return jsonResponse(200, { success: true, changed: outcome.changed });
    } catch (error) {
      console.error(`store ${store.id}: reassign_member failed:`, error);
      return errorResponse(500, "Impossible de corriger cette attribution.");
    }
  }

  if (action === "list_weeks") {
    try {
      return await handleListWeeks(service, store.id);
    } catch (error) {
      console.error(`store ${store.id}: list_weeks failed:`, error);
      return errorResponse(500, "Impossible de lire les semaines publiées.");
    }
  }

  if (action === "get_week") {
    try {
      return await handleGetWeek(service, store, weekStartParam);
    } catch (error) {
      console.error(`store ${store.id}: get_week failed:`, error);
      return errorResponse(500, "Impossible de lire cette semaine.");
    }
  }

  if (action === "save_edit") {
    try {
      return await handleSaveEdit(service, store.id, editInput as EditInput);
    } catch (error) {
      console.error(`store ${store.id}: save_edit failed:`, error);
      return errorResponse(500, "Impossible d'enregistrer cette correction.");
    }
  }

  if (action === "delete_edit") {
    try {
      return await handleDeleteEdit(service, store.id, editId);
    } catch (error) {
      console.error(`store ${store.id}: delete_edit failed:`, error);
      return errorResponse(500, "Impossible de retirer cette correction.");
    }
  }

  if (action === "apply_week") {
    try {
      return await handleApplyWeek(service, store, weekStartParam);
    } catch (error) {
      console.error(`store ${store.id}: apply_week failed:`, error);
      return errorResponse(500, "Impossible d'envoyer les modifications.");
    }
  }

  // --- Publication (dépôt de fichier) ----------------------------------------
  const planning = (validation as { planning: ParsedPlanning }).planning;

  let context: StoreContext;
  let edits: PlanningEdit[];
  let prepared: PreparedWeek;
  try {
    context = await loadStoreContext(service, store.id);
    // Le calque SURVIT au nouveau dépôt : c'est tout le principe. On le lit
    // avant d'écrire quoi que ce soit pour pouvoir l'annoncer dans l'aperçu.
    edits = await loadPlanningEdits(service, store.id, planning.week_start);
    prepared = await prepareWeek(service, planning, edits, context);
  } catch (error) {
    console.error(`store ${store.id}: week preparation failed:`, error);
    return errorResponse(500, "Impossible de préparer la publication de cette semaine.");
  }

  // Aperçu : on montre l'appariement et ce qui SERAIT écrit, sans rien écrire.
  if (dryRun) {
    const preview: MatchedEmployee[] = prepared.targets.map((target) => ({
      name: target.name,
      user_id: target.user_id,
      display_name: target.profile?.display_name ?? "",
      days_written: daysWrittenOf(target.rows),
      source: target.source,
    }));
    const counts = countEdits(edits);
    console.log(
      `store ${store.id} dry-run week ${planning.week_start}: ` +
        `${planning.employees.length} rows, ${preview.length} matched, ` +
        `${prepared.unmatched.length} unmatched, ${context.pendingMembers.length} pending, ` +
        `${counts.edit_count} edit(s) kept, ${counts.pre_publication_count} pre-publication, ` +
        `scoped=${prepared.pairing.scopedToStore}`,
    );
    return jsonResponse(200, {
      success: true,
      week_start: planning.week_start,
      matched: preview,
      unmatched: prepared.unmatched,
      pending_members: context.pendingMembers,
      notified: 0,
      // « N modifications manuelles conservées » : la responsable doit savoir
      // que ses ratures ne sont pas emportées par le nouveau fichier. Compté à
      // part de `pre_publication_count`, sans quoi l'aperçu d'un premier dépôt
      // annoncerait des « modifications conservées » pour des corrections que
      // personne n'a jamais vues.
      ...counts,
      // Le détail par entrée : le site sait laquelle est une rature et laquelle
      // a été corrigée avant envoi, y compris pour une journée mise en repos
      // (qui ne laisse aucun créneau derrière elle).
      edits,
      orphan_edit_ids: prepared.effective.orphanEditIds,
    });
  }

  // --- Infos de la semaine ----------------------------------------------------
  // Écrites AVANT les créneaux, par un remplacement atomique : si cette étape
  // échoue, rien n'a encore bougé côté horaires et la responsable peut rejouer
  // le dépôt à l'identique.
  const { error: noticesError } = await service.rpc("replace_store_notices", {
    p_store_id: store.id,
    p_week_start: planning.week_start,
    p_notices: notices,
  });
  if (noticesError) {
    console.error(`store ${store.id}: notices write failed:`, noticesError.message);
    return errorResponse(500, "Impossible d'enregistrer les infos de la semaine.");
  }

  const outcome = await publishPreparedWeek(service, store.id, prepared);

  const { error: importError } = await service.from("store_imports").insert({
    store_id: store.id,
    week_start: planning.week_start,
    source_file_name: planning.source_file_name,
    payload: planning,
    matched: outcome.matched,
    published_at: outcome.matched.length > 0 ? new Date().toISOString() : null,
  });
  if (importError) {
    // La publication a eu lieu : on ne la déclare pas en échec pour un défaut
    // de journalisation, on le signale seulement dans les logs.
    console.error(`store ${store.id}: store_imports insert failed:`, importError.message);
  }

  const counts = countEdits(edits);
  console.log(
    `store ${store.id} publish week ${planning.week_start}: ` +
      `${planning.employees.length} rows, ${outcome.matched.length} matched, ` +
      `${prepared.unmatched.length} unmatched, ${outcome.failures} failed, ` +
      `${outcome.skippedManual} shift(s) kept manual, ${outcome.notified} notified, ` +
      `${notices.length} notice(s), ${counts.edit_count} edit(s) kept, ` +
      `${counts.pre_publication_count} pre-publication, ` +
      `${context.pendingMembers.length} pending, scoped=${prepared.pairing.scopedToStore}`,
  );

  const responseBody = {
    week_start: planning.week_start,
    matched: outcome.matched,
    unmatched: prepared.unmatched,
    pending_members: context.pendingMembers,
    notified: outcome.notified,
    ...counts,
    orphan_edit_ids: prepared.effective.orphanEditIds,
  };

  if (outcome.failures > 0) {
    return jsonResponse(207, {
      success: false,
      error: `${outcome.matched.length} planning(s) publié(s), ${outcome.failures} en échec. ` +
        "Réessaie la publication : elle est sans risque, elle remplace la semaine.",
      ...responseBody,
    });
  }

  return jsonResponse(200, { success: true, ...responseBody });
});
