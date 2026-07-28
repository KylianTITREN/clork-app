// Presets de créneau personnalisables (Profil → Créneaux types) : chaque
// boîte a ses horaires (ex. 7h–13h le matin). Stockés sur l'appareil
// (AsyncStorage) — 3 presets par défaut, éditables/supprimables.

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ShiftPeriod, ShiftType } from "@/constants/tokens";
import type { CustomShiftType } from "@/lib/custom-types-service";

const STORAGE_KEY = "clork.presets";
export const MAX_PRESETS = 6;

/**
 * Types autorisés pour un preset : tous les types de créneau, y compris les
 * types sans horaires (repos, CP…) et les types personnalisés (un perso payé
 * est stocké type "work", non payé type "off", + customTypeId).
 */
export type PresetType = ShiftType;

export type ShiftPreset = {
  id: string;
  label: string; // ex. "🌅 Matin"
  type: PresetType;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  breakMinutes: number;
  // Catégorie facultative pré-remplie par le preset (ouverture, fermeture…).
  period?: ShiftPeriod | null;
  /**
   * Type personnalisé associé (custom_shift_types) — absent/null = type natif.
   * Champ optionnel : les presets déjà stockés restent valides tels quels.
   */
  customTypeId?: string | null;
};

// Types standard portant des horaires — aligné sur TIMED_DAY_TYPES de
// l'éditeur de jour (un type perso payé → "work", non payé → "off").
const TIMED_PRESET_TYPES: readonly ShiftType[] = ["work", "training", "meeting", "overtime"];

/**
 * Le preset porte-t-il des horaires ? Sans `customTypes`, on se fie au type
 * natif stocké ; avec, le caractère payé du type perso fait foi.
 */
export function presetHasTimes(
  preset: Pick<ShiftPreset, "type" | "customTypeId">,
  customTypes?: readonly CustomShiftType[],
): boolean {
  if (preset.customTypeId && customTypes) {
    const custom = customTypes.find((candidate) => candidate.id === preset.customTypeId);
    if (custom) return custom.isPaid;
  }
  return TIMED_PRESET_TYPES.includes(preset.type);
}

export const DEFAULT_PRESETS: ShiftPreset[] = [
  { id: "morning", label: "🌅 Matin", type: "work", start: "09:00", end: "13:00", breakMinutes: 0 },
  { id: "day", label: "☀️ Journée", type: "work", start: "09:00", end: "17:00", breakMinutes: 60 },
  { id: "evening", label: "🌙 Soir", type: "work", start: "14:00", end: "20:00", breakMinutes: 0 },
];

function isValidPreset(value: unknown): value is ShiftPreset {
  if (typeof value !== "object" || value === null) return false;
  const preset = value as Record<string, unknown>;
  return (
    typeof preset.id === "string" &&
    typeof preset.label === "string" &&
    typeof preset.type === "string" &&
    typeof preset.start === "string" &&
    typeof preset.end === "string" &&
    typeof preset.breakMinutes === "number" &&
    // customTypeId optionnel (rétrocompatible) : absent, null ou string.
    (preset.customTypeId === undefined ||
      preset.customTypeId === null ||
      typeof preset.customTypeId === "string")
  );
}

export async function loadPresets(): Promise<ShiftPreset[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PRESETS;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_PRESETS;
    const presets = parsed.filter(isValidPreset);
    return presets.length > 0 ? presets : DEFAULT_PRESETS;
  } catch {
    return DEFAULT_PRESETS;
  }
}

export async function savePresets(presets: ShiftPreset[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(presets.slice(0, MAX_PRESETS)));
}

export function newPresetId(): string {
  return `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
