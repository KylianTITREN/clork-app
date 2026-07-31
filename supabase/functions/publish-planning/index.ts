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

type MatchedEmployee = {
  name: string;
  user_id: string;
  display_name: string;
  days_written: number;
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
): Map<number, ProfileRow> {
  const keyed: EmployeeKey[] = employees
    .map((employee, index) => {
      const key = normalizeName(employee.name);
      return { index, key, words: new Set(key.split(" ").filter(Boolean)) };
    })
    .filter((entry) => entry.key.length > 0);

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

// --- Point d'entrée -----------------------------------------------------------

type StoreRow = { id: string; label: string; access_code: string };

async function authenticateStore(
  service: SupabaseClient,
  storeToken: string,
  accessCode: string,
): Promise<StoreRow | null> {
  const { data, error } = await service
    .from("stores")
    .select("id, label, access_code")
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

  const validation = validatePlanning(body.planning);
  if ("error" in validation) {
    return errorResponse(400, validation.error);
  }
  const planning = validation.planning;

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

  let profiles: ProfileRow[];
  try {
    profiles = await loadProfiles(service);
  } catch (error) {
    console.error(`store ${store.id}: profile load failed:`, error);
    return errorResponse(500, "Impossible de rechercher les comptes des employées.");
  }

  const pairs = matchEmployees(planning.employees, profiles);
  const unmatched = planning.employees
    .map((employee, index) => (pairs.has(index) ? null : employee.name))
    .filter((name): name is string => name !== null);

  const weekDates = Array.from({ length: DAYS_IN_WEEK }, (_, offset) =>
    addDaysISO(planning.week_start, offset),
  );

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
    }));
    console.log(
      `store ${store.id} dry-run week ${planning.week_start}: ` +
        `${planning.employees.length} rows, ${preview.length} matched, ${unmatched.length} unmatched`,
    );
    return jsonResponse(200, {
      success: true,
      week_start: planning.week_start,
      matched: preview,
      unmatched,
      notified: 0,
    });
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
      `${failures} failed, ${skippedManual} shift(s) kept manual, ${notified} notified`,
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
      notified,
    });
  }

  return jsonResponse(200, {
    success: true,
    week_start: planning.week_start,
    matched,
    unmatched,
    notified,
  });
});
