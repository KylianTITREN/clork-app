// Design tokens Clork — source unique pour couleurs, espacements, typo.
// Direction visuelle affinée en phase 7 ; les couleurs sémantiques des types
// de créneaux sont déjà contractuelles (utilisées du calendrier à l'export).

import { useColorScheme } from "react-native";

// DA de référence (décision Kylian 2026-06-11) : style « Timezy » Dribbble
// (planner clair, cartes très arrondies, typo grasse, blocs pastel) mais en
// VIOLET. Refs : dribbble.com/shots/26775582 et dribbble.com/shots/17982564.
export const palette = {
  // Accent : violet Clork.
  accent: "#6C4EF5",
  accentSoft: "#A593F9",
  accentMuted: "#EDE9FE",

  // Couleurs sémantiques par type de créneau (contrat produit).
  shiftWork: "#6C4EF5",
  shiftOff: "#9BA1AE",
  shiftRh: "#34C28C",
  shiftCp: "#F5A623",
  shiftLeave: "#F5A623",
  shiftMeeting: "#E861A4",

  danger: "#E5484D",
  success: "#30A46C",
} as const;

export type ThemeColors = Record<
  | "background"
  | "surface"
  | "surfaceMuted"
  | "border"
  | "text"
  | "textMuted"
  | keyof typeof palette,
  string
>;

export const lightColors: ThemeColors = {
  background: "#F6F4EF",
  surface: "#FFFFFF",
  surfaceMuted: "#EFECE4",
  border: "#E3DFD5",
  text: "#1D1A2B",
  textMuted: "#6F6A7E",
  ...palette,
};

export const darkColors: ThemeColors = {
  background: "#17141F",
  surface: "#221E2E",
  surfaceMuted: "#2C2738",
  border: "#393345",
  text: "#F4F1EA",
  textMuted: "#A29DB0",
  ...palette,
};

export function useThemeColors(): ThemeColors {
  return useColorScheme() === "dark" ? darkColors : lightColors;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

// Radius généreux — signature de la DA Timezy-like.
export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

export const typeScale = {
  hero: 40,
  title: 28,
  heading: 20,
  body: 16,
  caption: 13,
} as const;

export type ShiftType = "work" | "off" | "rh" | "cp" | "leave" | "meeting";

export const shiftTypeColor: Record<ShiftType, string> = {
  work: palette.shiftWork,
  off: palette.shiftOff,
  rh: palette.shiftRh,
  cp: palette.shiftCp,
  leave: palette.shiftLeave,
  meeting: palette.shiftMeeting,
};

export const shiftTypeLabel: Record<ShiftType, string> = {
  work: "Travail",
  off: "Repos",
  rh: "RH",
  cp: "Congé payé",
  leave: "Congé",
  meeting: "Réunion",
};
