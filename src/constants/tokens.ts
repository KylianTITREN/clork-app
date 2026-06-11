// Design tokens Clork — source unique pour couleurs, espacements, typo.
// Direction visuelle affinée en phase 7 ; les couleurs sémantiques des types
// de créneaux sont déjà contractuelles (utilisées du calendrier à l'export).

import { useColorScheme } from "react-native";

export const palette = {
  // Accent : corail chaleureux — app personnelle, pas un SaaS froid.
  accent: "#FF6B4A",
  accentSoft: "#FF8A70",

  // Couleurs sémantiques par type de créneau (contrat produit).
  shiftWork: "#5B7CFA",
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
  background: "#FAF7F2",
  surface: "#FFFFFF",
  surfaceMuted: "#F1ECE4",
  border: "#E4DDD2",
  text: "#1C1B22",
  textMuted: "#6E6A75",
  ...palette,
};

export const darkColors: ThemeColors = {
  background: "#1C1B22",
  surface: "#26242E",
  surfaceMuted: "#2F2C39",
  border: "#3A3744",
  text: "#F5F2EC",
  textMuted: "#A39FAC",
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

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
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
