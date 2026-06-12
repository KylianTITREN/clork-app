// Miroir des types de sortie de l'Edge Function extract-planning
// (source : supabase/functions/extract-planning/extraction.ts — garder en phase).

export type ShiftSlot = {
  start: string; // "HH:MM"
  end: string; // "HH:MM"
};

export type ExtractionDayStatus = "work" | "off" | "rh" | "cp" | "unknown";

export type ExtractionDay = {
  date: string; // "YYYY-MM-DD"
  status: ExtractionDayStatus;
  shifts: ShiftSlot[];
  duration_hours: number | null;
  handwritten_override: boolean;
  highlighted: boolean;
  note: string | null;
};

export type ExtractionEmployee = {
  name: string;
  row_index: number;
  days: ExtractionDay[];
  total_hours: number | null;
};

export type ExtractionGlobalNote = {
  text: string;
  applies_to: string; // "all" ou un nom d'employé
  date: string | null;
  start: string | null;
  end: string | null;
};

export type PlanningExtraction = {
  photo_quality: "good" | "degraded" | "unusable";
  store_label: string | null;
  week_number: number | null;
  week_start: string;
  week_end: string;
  employees: ExtractionEmployee[];
  global_notes: ExtractionGlobalNote[];
  warnings: string[];
};

export type ExtractFunctionResponse = {
  success: boolean;
  data: PlanningExtraction | null;
  error: string | null;
  meta?: {
    model: string;
    usage: { input_tokens: number; output_tokens: number };
  };
};
