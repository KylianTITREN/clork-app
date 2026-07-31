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
// Actions supportées (champ `action`, absent = publication) :
//   · verify_only   : le couple (lien, code) est-il valide ?
//   · dry_run       : aperçu de l'appariement, aucune écriture.
//   · confirm_members : la responsable attribue une ligne du fichier à chaque
//                       adhésion en attente.
//   · (défaut)      : publication réelle + infos de la semaine + push.

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
/** Expo accepte 100 messages par requête. */
const PUSH_CHUNK_SIZE = 100;
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

const FR_DATE = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

function frenchDate(iso: string): string {
  return FR_DATE.format(new Date(`${iso}T00:00:00Z`));
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
    if (typeof rawName !== "string") return { error: "Une confirmation est sans nom de ligne." };

    const name = rawName.trim().replace(/\s+/g, " ");
    if (name.length === 0) return { error: "Le nom de la ligne ne peut pas être vide." };
    if (name.length > MAX_EMPLOYEE_NAME) {
      return { error: `Un nom de ligne dépasse ${MAX_EMPLOYEE_NAME} caractères.` };
    }
    const key = normalizeName(name);
    if (key.length === 0) return { error: `« ${name} » ne ressemble pas à un nom.` };

    if (seenUsers.has(userId)) return { error: "Un même compte apparaît deux fois." };
    if (seenNames.has(key)) return { error: `La ligne « ${name} » est attribuée deux fois.` };
    seenUsers.add(userId);
    seenNames.add(key);

    assignments.push({ user_id: userId, employee_name: name });
  }
  return { assignments };
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

// --- Construction des créneaux ------------------------------------------------

type ShiftRow = {
  user_id: string;
  date: string;
  start_at: string;
  end_at: string;
  type: "work";
  break_minutes: number;
  source: "import";
  is_edited: false;
};

/**
 * Pause = amplitude (premier départ → dernier retour) moins les heures PAYÉES
 * imprimées sur le planning. Sans durée imprimée, on retombe sur la règle de
 * pause du magasin ; sans règle, aucune pause n'est supposée.
 */
function breakMinutesForDay(day: ParsedDay, planning: ParsedPlanning): number {
  const starts = day.shifts.map((shift) => minutesOf(shift.start));
  const ends = day.shifts.map((shift) => minutesOf(shift.end));
  const span = Math.max(...ends) - Math.min(...starts);

  if (day.duration_hours === null) {
    const rule = planning.break_rule;
    if (!rule) return 0;
    return span > rule.above_hours * 60 ? Math.min(rule.deduct_minutes, MAX_BREAK_MINUTES) : 0;
  }
  const paid = Math.round(day.duration_hours * 60);
  return Math.min(Math.max(span - paid, 0), MAX_BREAK_MINUTES);
}

function buildShiftRows(
  userId: string,
  employee: ParsedEmployee,
  planning: ParsedPlanning,
): ShiftRow[] {
  return employee.days
    .filter((day) => day.status === "work" && day.shifts.length > 0)
    .flatMap((day) => {
      const breakMinutes = breakMinutesForDay(day, planning);
      // La pause déduite est portée par le premier créneau de la journée :
      // le total payé du jour reste juste quel que soit le découpage.
      return day.shifts.map((shift, index) => ({
        user_id: userId,
        date: day.date,
        start_at: toParisTimestamp(day.date, shift.start),
        end_at: toParisTimestamp(day.date, shift.end),
        type: "work" as const,
        break_minutes: index === 0 ? breakMinutes : 0,
        source: "import" as const,
        is_edited: false as const,
      }));
    });
}

// --- Écriture -----------------------------------------------------------------

type WriteOutcome = { daysWritten: number; skippedManual: number };

/**
 * Remplace la semaine d'une employée. Les créneaux 'manual' survivent : ils ne
 * sont ni supprimés, ni écrasés — si l'un occupe déjà (date, heure de début),
 * la ligne du fichier est abandonnée pour ce créneau précis.
 */
async function writeWeek(
  service: SupabaseClient,
  userId: string,
  rows: ShiftRow[],
  weekDates: readonly string[],
): Promise<WriteOutcome> {
  const { error: deleteError } = await service
    .from("shifts")
    .delete()
    .eq("user_id", userId)
    .in("date", weekDates)
    .in("source", ["import", "scan"]);
  if (deleteError) throw new Error("shifts delete failed: " + deleteError.message);

  const { data: manual, error: manualError } = await service
    .from("shifts")
    .select("date, start_at")
    .eq("user_id", userId)
    .in("date", weekDates);
  if (manualError) throw new Error("shifts read failed: " + manualError.message);

  const busy = new Set(
    ((manual ?? []) as { date: string; start_at: string | null }[])
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
  return {
    daysWritten: new Set(insertable.map((row) => row.date)).size,
    skippedManual,
  };
}

// --- Notifications push (best-effort) -----------------------------------------

type PushMessage = { to: string; title: string; body: string; sound: "default" };

function isExpoToken(token: string | null): token is string {
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

function pushMessage(token: string, weekStart: string, daysWritten: number): PushMessage {
  const days = daysWritten <= 1 ? `${daysWritten} jour travaillé` : `${daysWritten} jours travaillés`;
  return {
    to: token.trim(),
    title: "Ton planning de la semaine est arrivé",
    body: `Semaine du ${frenchDate(weekStart)} — ${days}`,
    sound: "default",
  };
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
        error: `Ce compte est déjà confirmé sur « ${existing.employee_name} ».`,
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

  const action = body.action;
  if (action !== undefined && action !== null && action !== "confirm_members") {
    return errorResponse(400, "Action inconnue.");
  }
  const isConfirmAction = action === "confirm_members";

  // Les deux modes hors publication ne portent pas de planning : les valider
  // contre le contrat du planning renverrait une erreur incompréhensible.
  const skipPlanning = verifyOnly || isConfirmAction;
  const validation = skipPlanning ? null : validatePlanning(body.planning);
  if (validation && "error" in validation) {
    return errorResponse(400, validation.error);
  }

  let assignments: readonly Assignment[] = [];
  if (isConfirmAction) {
    const parsed = validateAssignments(body.assignments);
    if ("error" in parsed) return errorResponse(400, parsed.error);
    assignments = parsed.assignments;
  }

  // Les infos de la semaine sont validées AVANT toute écriture : une date hors
  // semaine ne doit pas être découverte après que les créneaux sont posés.
  const weekDates = validation
    ? Array.from({ length: DAYS_IN_WEEK }, (_, offset) =>
      addDaysISO(validation.planning.week_start, offset)
    )
    : [];
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

  if (isConfirmAction) {
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

  const planning = (validation as { planning: ParsedPlanning }).planning;

  // --- Adhésions du magasin ---------------------------------------------------
  let members: StoreMemberRow[];
  let memberProfiles: ProfileRow[];
  try {
    members = await loadStoreMembers(service, store.id);
    memberProfiles = await loadProfilesByIds(service, members.map((member) => member.user_id));
  } catch (error) {
    console.error(`store ${store.id}: member load failed:`, error);
    return errorResponse(500, "Impossible de lire l'équipe du magasin.");
  }
  const profileById = new Map(memberProfiles.map((profile) => [profile.id, profile]));
  const confirmedMembers = members.filter((member) => member.status === "confirmed");
  const pendingMembers: PendingMember[] = members
    .filter((member) => member.status === "pending")
    .map((member) => ({
      user_id: member.user_id,
      display_name: profileById.get(member.user_id)?.display_name ?? "",
      joined_at: member.created_at,
    }));

  // --- Appariement ------------------------------------------------------------
  // 1. Les adhésions confirmées : la responsable a désigné la ligne elle-même.
  const pairs = new Map<number, ProfileRow>();
  const sources = new Map<number, MatchSource>();
  for (const [index, userId] of matchByMemberName(planning.employees, confirmedMembers)) {
    const profile = profileById.get(userId);
    // Profil supprimé entre-temps : l'adhésion est orpheline, on l'ignore.
    if (!profile) continue;
    pairs.set(index, profile);
    sources.set(index, "member");
  }

  // 2. Repli par rapprochement de noms. CLOISONNEMENT : dès que le magasin
  //    compte un membre confirmé, ce repli ne regarde plus que ses membres —
  //    une homonyme d'un autre magasin ne peut plus être appariée. Un magasin
  //    encore sans membre confirmé garde l'ancien comportement, sinon sa
  //    première publication n'atteindrait personne.
  const scopedToStore = confirmedMembers.length > 0;
  let fallbackPool: ProfileRow[];
  try {
    fallbackPool = scopedToStore
      ? confirmedMembers
        .map((member) => profileById.get(member.user_id))
        .filter((profile): profile is ProfileRow => profile !== undefined)
      : await loadProfiles(service);
  } catch (error) {
    console.error(`store ${store.id}: profile load failed:`, error);
    return errorResponse(500, "Impossible de rechercher les comptes des employées.");
  }
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

  const unmatched = planning.employees
    .map((employee, index) => (pairs.has(index) ? null : employee.name))
    .filter((name): name is string => name !== null);

  // Aperçu : on montre l'appariement et ce qui SERAIT écrit, sans rien écrire.
  if (dryRun) {
    const preview: MatchedEmployee[] = [...pairs].map(([index, profile]) => ({
      name: planning.employees[index].name,
      user_id: profile.id,
      display_name: profile.display_name ?? "",
      days_written: buildShiftRows(profile.id, planning.employees[index], planning).reduce(
        (dates, row) => dates.add(row.date),
        new Set<string>(),
      ).size,
      source: sources.get(index) ?? "name",
    }));
    console.log(
      `store ${store.id} dry-run week ${planning.week_start}: ` +
        `${planning.employees.length} rows, ${preview.length} matched, ${unmatched.length} unmatched, ` +
        `${pendingMembers.length} pending, scoped=${scopedToStore}`,
    );
    return jsonResponse(200, {
      success: true,
      week_start: planning.week_start,
      matched: preview,
      unmatched,
      pending_members: pendingMembers,
      notified: 0,
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

  const matched: MatchedEmployee[] = [];
  const messages: PushMessage[] = [];
  let failures = 0;
  let skippedManual = 0;

  for (const [index, profile] of pairs) {
    const employee = planning.employees[index];
    try {
      const rows = buildShiftRows(profile.id, employee, planning);
      const outcome = await writeWeek(service, profile.id, rows, weekDates);
      skippedManual += outcome.skippedManual;
      matched.push({
        name: employee.name,
        user_id: profile.id,
        display_name: profile.display_name ?? "",
        days_written: outcome.daysWritten,
        source: sources.get(index) ?? "name",
      });
      // Preference serveur : une employee peut couper cette notification
      // depuis Notifications. Absente (ancien profil) = on notifie.
      const wantsPush = profile.notify_employer_planning !== false;
      if (wantsPush && isExpoToken(profile.expo_push_token)) {
        messages.push(pushMessage(profile.expo_push_token, planning.week_start, outcome.daysWritten));
      }
    } catch (error) {
      // Jamais de nom dans les logs : la ligne du fichier suffit à retrouver
      // la personne dans le payload conservé par store_imports.
      failures += 1;
      console.error(`store ${store.id}: row ${employee.row_index} write failed:`, error);
    }
  }

  const notified = await sendPushNotifications(messages);

  const { error: importError } = await service.from("store_imports").insert({
    store_id: store.id,
    week_start: planning.week_start,
    source_file_name: planning.source_file_name,
    payload: planning,
    matched,
    published_at: matched.length > 0 ? new Date().toISOString() : null,
  });
  if (importError) {
    // La publication a eu lieu : on ne la déclare pas en échec pour un défaut
    // de journalisation, on le signale seulement dans les logs.
    console.error(`store ${store.id}: store_imports insert failed:`, importError.message);
  }

  console.log(
    `store ${store.id} publish week ${planning.week_start}: ` +
      `${planning.employees.length} rows, ${matched.length} matched, ${unmatched.length} unmatched, ` +
      `${failures} failed, ${skippedManual} shift(s) kept manual, ${notified} notified, ` +
      `${notices.length} notice(s), ${pendingMembers.length} pending, scoped=${scopedToStore}`,
  );

  if (failures > 0) {
    return jsonResponse(207, {
      success: false,
      error:
        `${matched.length} planning(s) publié(s), ${failures} en échec. ` +
        "Réessaie la publication : elle est sans risque, elle remplace la semaine.",
      week_start: planning.week_start,
      matched,
      unmatched,
      pending_members: pendingMembers,
      notified,
    });
  }

  return jsonResponse(200, {
    success: true,
    week_start: planning.week_start,
    matched,
    unmatched,
    pending_members: pendingMembers,
    notified,
  });
});
