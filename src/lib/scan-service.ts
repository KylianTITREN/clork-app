// Pipeline du scan : compression → upload storage → extraction IA → helpers
// de ciblage et de conversion vers les shifts.

import { decode } from "base64-arraybuffer";
import * as ImageManipulator from "expo-image-manipulator";

import type {
  ExtractionDay,
  ExtractionEmployee,
  ExtractFunctionResponse,
  PlanningExtraction,
} from "@/lib/extraction-types";
import { supabase } from "@/lib/supabase";
import type { ShiftType } from "@/constants/tokens";

// En dessous de ~2000 px de grand côté, l'extraction hallucine (testé phase 1).
const TARGET_LONG_EDGE = 2400;
const JPEG_QUALITY = 0.8;

export type PreparedImage = {
  base64: string;
  width: number;
  height: number;
};

export async function prepareImage(
  uri: string,
  width: number,
  height: number,
): Promise<PreparedImage> {
  const context = ImageManipulator.ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > TARGET_LONG_EDGE) {
    context.resize(
      width >= height ? { width: TARGET_LONG_EDGE } : { height: TARGET_LONG_EDGE },
    );
  }
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    format: ImageManipulator.SaveFormat.JPEG,
    compress: JPEG_QUALITY,
    base64: true,
  });
  if (!result.base64) {
    throw new Error("Compression de la photo impossible");
  }
  return { base64: result.base64, width: result.width, height: result.height };
}

export async function createScan(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("scans")
    .insert({ uploader_id: userId, photo_path: "" })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) {
    throw new Error("Création du scan impossible : " + (error?.message ?? "?"));
  }
  return data.id;
}

export async function uploadScanPhoto(
  userId: string,
  scanId: string,
  base64: string,
): Promise<string> {
  const path = `${userId}/${scanId}.jpg`;
  const { error } = await supabase.storage
    .from("scans")
    .upload(path, decode(base64), { contentType: "image/jpeg", upsert: true });
  if (error) {
    throw new Error("Upload de la photo impossible : " + error.message);
  }
  await supabase.from("scans").update({ photo_path: path }).eq("id", scanId);
  return path;
}

// Lance l'extraction côté serveur : la fonction répond 202 immédiatement et
// continue en tâche de fond, on suit l'avancement par polling sur la table.
export async function startExtraction(scanId: string, base64: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke<ExtractFunctionResponse>(
    "extract-planning",
    { body: { scan_id: scanId, image_base64: base64, media_type: "image/jpeg" } },
  );
  if (error) {
    throw new Error("Lancement de l'extraction échoué : " + error.message);
  }
  if (!data?.success) {
    throw new Error(data?.error ?? "Lancement de l'extraction échoué");
  }
}

const POLL_INTERVAL_MS = 4_000;
const POLL_TIMEOUT_MS = 5 * 60_000;

export async function waitForExtraction(scanId: string): Promise<PlanningExtraction> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from("scans")
      .select("status, raw_extraction, error_message")
      .eq("id", scanId)
      .single<{ status: string; raw_extraction: PlanningExtraction | null; error_message: string | null }>();
    if (error) {
      throw new Error("Suivi du scan impossible : " + error.message);
    }
    if (data.status === "extracted" && data.raw_extraction) {
      return data.raw_extraction;
    }
    if (data.status === "failed") {
      throw new Error(data.error_message ?? "L'extraction a échoué — réessaie.");
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error("L'extraction prend trop de temps — réessaie dans un instant.");
}

export async function fetchScanRowIds(scanId: string): Promise<Map<number, string>> {
  const { data, error } = await supabase
    .from("scan_rows")
    .select("id, row_index")
    .eq("scan_id", scanId);
  if (error || !data) {
    throw new Error("Lecture des lignes impossible : " + (error?.message ?? "?"));
  }
  return new Map(data.map((r: { id: string; row_index: number }) => [r.row_index, r.id]));
}

export async function markScanValidated(scanId: string): Promise<void> {
  await supabase.from("scans").update({ status: "validated" }).eq("id", scanId);
}

// Scan extrait mais jamais validé (app fermée pendant la lecture) → à reprendre.
export type PendingScan = {
  id: string;
  week_start: string | null;
  raw_extraction: PlanningExtraction;
};

export async function findPendingValidation(userId: string): Promise<PendingScan | null> {
  const { data } = await supabase
    .from("scans")
    .select("id, week_start, raw_extraction")
    .eq("uploader_id", userId)
    .eq("status", "extracted")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<PendingScan>();
  return data?.raw_extraction ? data : null;
}

// --- Plannings sans en-tête : résolution des dates ----------------------------

import { addDays } from "@/lib/dates";

export function hasResolvedDates(extraction: PlanningExtraction): boolean {
  return extraction.week_start != null;
}

/** Recalcule toutes les dates depuis le lundi fourni par l'utilisateur. */
export function applyWeekStart(
  extraction: PlanningExtraction,
  mondayISO: string,
): PlanningExtraction {
  return {
    ...extraction,
    week_start: mondayISO,
    week_end: addDays(mondayISO, 6),
    employees: extraction.employees.map((employee) => ({
      ...employee,
      days: employee.days.map((day) => ({
        ...day,
        date: addDays(mondayISO, day.day_index),
      })),
    })),
    global_notes: extraction.global_notes, // leurs dates restent telles quelles
  };
}

// --- Ciblage de SA ligne -----------------------------------------------------

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

export function findTargetEmployee(
  employees: ExtractionEmployee[],
  aliases: string[],
  displayName: string,
): ExtractionEmployee | null {
  const candidates = [...aliases, displayName].filter(Boolean).map(normalizeName);
  // Match exact d'abord, puis inclusion de tous les mots de l'alias.
  for (const employee of employees) {
    const name = normalizeName(employee.name);
    if (candidates.some((c) => c === name)) return employee;
  }
  for (const employee of employees) {
    const nameWords = new Set(normalizeName(employee.name).split(" "));
    if (
      candidates.some((c) => {
        const words = c.split(" ");
        return words.length > 0 && words.every((w) => nameWords.has(w));
      })
    ) {
      return employee;
    }
  }
  return null;
}

// --- Contrôle de cohérence (somme durées vs total hebdo imprimé) -------------

export function isRowCoherent(employee: ExtractionEmployee): boolean {
  if (employee.total_hours == null) return true;
  const sum = employee.days.reduce((acc, d) => acc + (d.duration_hours ?? 0), 0);
  return Math.abs(sum - employee.total_hours) <= 0.01;
}

// --- Conversion extraction → shifts éditables --------------------------------

export type DraftShift = {
  date: string; // YYYY-MM-DD
  type: ShiftType;
  start: string | null; // "HH:MM"
  end: string | null;
  // Durée PAYÉE imprimée sur le planning ; l'écart avec l'amplitude = pause.
  durationHours: number | null;
  breakStart: string | null; // début de pause ("12:30"), fin = début + pause
  note: string | null;
  fromHandwriting: boolean;
  highlighted: boolean;
  include: boolean; // décoché = pas enregistré
};

export function spanHours(draft: DraftShift): number | null {
  if (!draft.start || !draft.end) return null;
  const [sh, sm] = draft.start.split(":").map(Number);
  const [eh, em] = draft.end.split(":").map(Number);
  if ([sh, sm, eh, em].some(Number.isNaN)) return null;
  return (eh * 60 + em - (sh * 60 + sm)) / 60;
}

// Pause non payée déduite (ex: 10h-18h durée 7 → 1h), null si indéterminable.
export function breakMinutes(draft: DraftShift): number {
  if (draft.durationHours == null) return 0;
  const span = spanHours(draft);
  if (span == null) return 0;
  const minutes = Math.round((span - draft.durationHours) * 60);
  return minutes > 0 && minutes <= 480 ? minutes : 0;
}

// Heures payées du créneau : durée imprimée si dispo, sinon amplitude brute.
export function paidHours(draft: DraftShift): number {
  return draft.durationHours ?? spanHours(draft) ?? 0;
}

// Pause par défaut du profil : appliquée seulement quand le planning
// n'imprime pas de durée payée (durationHours null).
export type BreakPrefs = {
  minutes: number;
  thresholdHours: number;
  startTime: string | null; // heure habituelle de pause ("12:30")
};

export function applyDefaultBreak(
  drafts: DraftShift[],
  prefs: BreakPrefs,
): DraftShift[] {
  return drafts.map((draft) => {
    if (draft.type !== "work") return draft;
    let next = draft;
    // Durée payée absente : applique la pause par défaut du profil.
    if (next.durationHours == null && prefs.minutes > 0) {
      const span = spanHours(next);
      if (span != null && span >= prefs.thresholdHours) {
        next = { ...next, durationHours: span - prefs.minutes / 60 };
      }
    }
    // Heure habituelle de pause : posée dès qu'une pause existe.
    if (next.breakStart == null && prefs.startTime && breakMinutes(next) > 0) {
      next = { ...next, breakStart: prefs.startTime };
    }
    return next;
  });
}

const STATUS_TO_TYPE: Record<ExtractionDay["status"], ShiftType> = {
  work: "work",
  off: "off",
  rh: "rh",
  cp: "cp",
  unknown: "off",
};

export function toDraftShifts(employee: ExtractionEmployee): DraftShift[] {
  const drafts: DraftShift[] = [];
  for (const day of employee.days) {
    // Dates résolues en amont (applyWeekStart si le planning n'en imprime pas).
    if (!day.date) continue;
    if (day.status === "work" && day.shifts.length > 0) {
      for (const slot of day.shifts) {
        drafts.push({
          date: day.date,
          type: "work",
          start: slot.start,
          end: slot.end,
          // En cas de coupure (2 créneaux), la durée imprimée couvre la journée
          // entière : impossible de la ventiler par créneau → pas de pause déduite.
          durationHours: day.shifts.length === 1 ? day.duration_hours : null,
          breakStart: null,
          note: day.note,
          fromHandwriting: day.handwritten_override,
          highlighted: day.highlighted,
          include: true,
        });
      }
    } else {
      drafts.push({
        date: day.date,
        type: STATUS_TO_TYPE[day.status],
        start: null,
        end: null,
        durationHours: null,
        breakStart: null,
        note: day.status === "unknown" ? (day.note ?? "Illisible sur la photo") : day.note,
        fromHandwriting: day.handwritten_override,
        highlighted: day.highlighted,
        // Les repos simples ne polluent pas le calendrier par défaut ;
        // RH/CP oui (utile à voir), unknown non (à corriger manuellement).
        include: day.status === "rh" || day.status === "cp",
      });
    }
  }
  return drafts;
}

export function meetingDraftsFromNotes(
  extraction: PlanningExtraction,
): DraftShift[] {
  return extraction.global_notes
    .filter((n) => n.applies_to === "all" && n.date && n.start)
    .map((n) => ({
      date: n.date as string,
      type: "meeting" as ShiftType,
      start: n.start,
      end: n.end ?? addOneHour(n.start as string),
      durationHours: null,
      breakStart: null,
      note: n.text,
      fromHandwriting: true,
      highlighted: false,
      include: true,
    }));
}

function addOneHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${String(Math.min(h + 1, 23)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// --- Enregistrement final -----------------------------------------------------

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateDraft(draft: DraftShift): string | null {
  if (!draft.include) return null;
  if (draft.type === "work" || draft.type === "meeting") {
    if (!draft.start || !TIME_RE.test(draft.start)) return `${draft.date} : heure de début invalide`;
    if (!draft.end || !TIME_RE.test(draft.end)) return `${draft.date} : heure de fin invalide`;
    if (draft.end <= draft.start) return `${draft.date} : la fin doit être après le début`;
  }
  return null;
}

function toTimestamp(date: string, time: string): string {
  // Interprété dans le fuseau du téléphone (la France pour nos utilisatrices).
  return new Date(`${date}T${time}:00`).toISOString();
}

export async function saveShifts(
  userId: string,
  drafts: DraftShift[],
  scanRowId: string | null,
): Promise<number> {
  const rows = drafts
    .filter((d) => d.include)
    .map((d) => ({
      user_id: userId,
      scan_row_id: scanRowId,
      date: d.date,
      start_at: d.start ? toTimestamp(d.date, d.start) : null,
      end_at: d.end ? toTimestamp(d.date, d.end) : null,
      type: d.type,
      break_minutes: breakMinutes(d),
      break_start: breakMinutes(d) > 0 ? d.breakStart : null,
      note: d.note,
      source: "scan" as const,
      is_edited: d.fromHandwriting,
    }));
  if (rows.length === 0) return 0;

  const { error } = await supabase
    .from("shifts")
    .upsert(rows, { onConflict: "user_id,date,start_at" });
  if (error) {
    throw new Error("Enregistrement des créneaux impossible : " + error.message);
  }
  return rows.length;
}
