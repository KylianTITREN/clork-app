// Types des lignes Postgres manipulées par l'app.
// (Génération automatique via `supabase gen types` envisageable plus tard.)

import type { ShiftPeriod, ShiftType } from "@/constants/tokens";

export type Profile = {
  id: string;
  display_name: string;
  employee_aliases: string[];
  employee_id: string | null;
  // Pause par défaut quand le planning n'imprime pas la durée payée :
  // break_default_minutes appliqués dès que l'amplitude ≥ break_threshold_hours.
  break_default_minutes: number;
  break_threshold_hours: number;
  // Heure de début de pause habituelle ("12:30"), null si non renseignée.
  break_start_default: string | null;
  follow_code: string;
  plan: "free" | "premium" | "founder";
  created_at: string;
  updated_at: string;
};

export type ScanStatus = "pending" | "extracted" | "validated" | "failed";
export type PhotoQuality = "good" | "degraded" | "unusable";

export type Scan = {
  id: string;
  uploader_id: string;
  photo_path: string;
  store_label: string | null;
  week_start: string | null;
  week_end: string | null;
  status: ScanStatus;
  photo_quality: PhotoQuality | null;
  raw_extraction: unknown;
  created_at: string;
  updated_at: string;
};

export type Shift = {
  id: string;
  user_id: string;
  scan_row_id: string | null;
  date: string;
  start_at: string | null;
  end_at: string | null;
  type: ShiftType;
  break_minutes: number;
  break_start: string | null; // "HH:MM:SS" côté Postgres (time)
  // Catégorie assignée par l'utilisateur (sinon déduite des horaires à l'affichage).
  period: ShiftPeriod | null;
  note: string | null;
  source: "scan" | "manual";
  is_edited: boolean;
  created_at: string;
  updated_at: string;
};
