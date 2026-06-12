// Pont de données app → widgets iOS (WidgetKit).
// Écrit un instantané JSON des créneaux dans les UserDefaults partagés de
// l'App Group (clé "widget-data"), puis recharge les timelines des widgets.
// Best-effort : ne doit JAMAIS faire échouer l'app appelante.

import { Platform } from "react-native";

import { addDays, mondayOf } from "./dates";
import type { Shift } from "./types";

const APP_GROUP = "group.com.kyks.clork";
const STORAGE_KEY = "widget-data";
/** Fenêtre glissante : semaine courante + semaine suivante. */
const WINDOW_DAYS = 14;

/** Forme lue par les widgets Swift (targets/clork-widgets/WidgetData.swift). */
export type WidgetShift = {
  date: string; // "YYYY-MM-DD"
  type: Shift["type"];
  start: string | null; // "HH:MM" local
  end: string | null; // "HH:MM" local
  breakMinutes: number;
};

export type WidgetPayload = {
  updatedAt: string;
  shifts: WidgetShift[];
};

/** Timestamp ISO (start_at/end_at) → "HH:MM" en heure locale. */
function toLocalTime(timestamp: string | null): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function buildWidgetPayload(shifts: Shift[], now: Date = new Date()): WidgetPayload {
  const from = mondayOf(now);
  const to = addDays(from, WINDOW_DAYS - 1);
  return {
    updatedAt: now.toISOString(),
    shifts: shifts
      .filter((shift) => shift.date >= from && shift.date <= to)
      .map((shift) => ({
        date: shift.date,
        type: shift.type,
        start: toLocalTime(shift.start_at),
        end: toLocalTime(shift.end_at),
        breakMinutes: shift.break_minutes,
      })),
  };
}

/**
 * Pousse les créneaux vers les widgets iOS et recharge leurs timelines.
 * No-op silencieux hors iOS, en Expo Go, ou si l'App Group est indisponible
 * (ex. provisioning incomplet sur compte Apple gratuit).
 */
export type WidgetTheme = { accent: string; onAccent: string };

export async function refreshWidgetData(
  shifts: Shift[],
  theme?: WidgetTheme,
): Promise<void> {
  if (Platform.OS !== "ios") return;
  try {
    // require synchrone plutôt qu'import() : les requires asynchrones cassent
    // au hot reload de Metro (« Requiring unknown module »).
    const { ExtensionStorage } =
      require("@bacons/apple-targets") as typeof import("@bacons/apple-targets");
    const storage = new ExtensionStorage(APP_GROUP);
    storage.set(STORAGE_KEY, JSON.stringify(buildWidgetPayload(shifts)));
    if (theme) {
      storage.set("widget-accent", theme.accent);
      storage.set("widget-on-accent", theme.onAccent);
    }
    ExtensionStorage.reloadWidget();
  } catch {
    // Module natif absent ou App Group inaccessible : les widgets
    // afficheront simplement leur état vide. Rien à signaler à l'utilisateur.
  }
}
