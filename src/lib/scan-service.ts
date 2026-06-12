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

export async function runExtraction(base64: string): Promise<PlanningExtraction> {
  const { data, error } = await supabase.functions.invoke<ExtractFunctionResponse>(
    "extract-planning",
    { body: { image_base64: base64, media_type: "image/jpeg" } },
  );
  if (error) {
    throw new Error("Extraction échouée : " + error.message);
  }
  if (!data?.success || !data.data) {
    throw new Error(data?.error ?? "Extraction échouée");
  }
  return data.data;
}

export async function saveExtractionResult(
  scanId: string,
  extraction: PlanningExtraction,
): Promise<Map<number, string>> {
  const { error } = await supabase
    .from("scans")
    .update({
      status: "extracted",
      photo_quality: extraction.photo_quality,
      store_label: extraction.store_label,
      week_start: extraction.week_start,
      week_end: extraction.week_end,
      raw_extraction: extraction,
    })
    .eq("id", scanId);
  if (error) {
    throw new Error("Sauvegarde du scan impossible : " + error.message);
  }

  const rows = extraction.employees.map((employee) => ({
    scan_id: scanId,
    employee_label: employee.name,
    row_index: employee.row_index,
    raw: employee,
  }));
  const { data: inserted, error: rowsError } = await supabase
    .from("scan_rows")
    .insert(rows)
    .select("id, row_index");
  if (rowsError || !inserted) {
    throw new Error("Sauvegarde des lignes impossible : " + (rowsError?.message ?? "?"));
  }
  return new Map(inserted.map((r: { id: string; row_index: number }) => [r.row_index, r.id]));
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
  note: string | null;
  fromHandwriting: boolean;
  include: boolean; // décoché = pas enregistré
};

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
    if (day.status === "work" && day.shifts.length > 0) {
      for (const slot of day.shifts) {
        drafts.push({
          date: day.date,
          type: "work",
          start: slot.start,
          end: slot.end,
          note: day.note,
          fromHandwriting: day.handwritten_override,
          include: true,
        });
      }
    } else {
      drafts.push({
        date: day.date,
        type: STATUS_TO_TYPE[day.status],
        start: null,
        end: null,
        note: day.status === "unknown" ? (day.note ?? "Illisible sur la photo") : day.note,
        fromHandwriting: day.handwritten_override,
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
      note: n.text,
      fromHandwriting: true,
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
