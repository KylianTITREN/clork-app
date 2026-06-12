// Design tokens Clork — source unique pour couleurs, typo, espacements.
// DA actée (Kylian, captures Dribbble du 2026-06-12) : style « Timezy »
// transposé en violet — fond lavande pastel, cartes crème/pastel très
// arrondies à encre foncée, typo ronde (Nunito), ombres douces.

import { useColorScheme } from "react-native";

export const palette = {
  // Accent : violet Clork.
  accent: "#6C4EF5",
  accentSoft: "#A593F9",
  accentMuted: "#E9E4FD",

  // Types de créneau : couleur forte (points, dots) + fond pastel (cartes),
  // texte toujours en encre — c'est la signature Timezy.
  shiftWork: "#6C4EF5",
  shiftWorkSoft: "#E9E4FD",
  shiftOff: "#9BA1AE",
  shiftOffSoft: "#F0EFF4",
  shiftRh: "#2FA877",
  shiftRhSoft: "#DFF4EA",
  shiftCp: "#E79A23",
  shiftCpSoft: "#FCF0DB",
  shiftLeave: "#E79A23",
  shiftLeaveSoft: "#FCF0DB",
  shiftMeeting: "#E861A4",
  shiftMeetingSoft: "#FDE4F0",

  danger: "#E5484D",
  success: "#2FA877",
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
  background: "#EFECF9", // lavande pastel
  surface: "#FFFFFF",
  surfaceMuted: "#F6F4FC",
  border: "#E3DFF0",
  text: "#251F3D", // encre violette
  textMuted: "#716C87",
  ...palette,
};

export const darkColors: ThemeColors = {
  background: "#171321",
  surface: "#221C31",
  surfaceMuted: "#2B2440",
  border: "#3A3252",
  text: "#F2EFFA",
  textMuted: "#A39DBA",
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

// Rayons très généreux — signature de la DA.
export const radius = {
  sm: 12,
  md: 18,
  lg: 28,
  pill: 999,
} as const;

export const typeScale = {
  hero: 40,
  title: 28,
  heading: 20,
  body: 16,
  caption: 13,
} as const;

// Familles Nunito (chargées dans le layout racine). Avec une police custom,
// utiliser fontFamily SANS fontWeight (Android ignore le mix).
export const fonts = {
  black: "Nunito_900Black",
  extraBold: "Nunito_800ExtraBold",
  bold: "Nunito_700Bold",
  semiBold: "Nunito_600SemiBold",
  regular: "Nunito_400Regular",
} as const;

// Ombre douce des cartes (iOS) + elevation légère (Android).
export const softShadow = {
  shadowColor: "#3B2E7A",
  shadowOpacity: 0.08,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 3,
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

export const shiftTypeSoftColor: Record<ShiftType, string> = {
  work: palette.shiftWorkSoft,
  off: palette.shiftOffSoft,
  rh: palette.shiftRhSoft,
  cp: palette.shiftCpSoft,
  leave: palette.shiftLeaveSoft,
  meeting: palette.shiftMeetingSoft,
};

export const shiftTypeLabel: Record<ShiftType, string> = {
  work: "Travail",
  off: "Repos",
  rh: "RH",
  cp: "Congé payé",
  leave: "Congé",
  meeting: "Réunion",
};

/** Poste déduit des horaires : Matin / Après-midi / Journée. */
export function shiftPeriodLabel(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  if (end <= "13:30") return "Matin";
  if (start >= "12:00") return "Après-midi";
  return "Journée";
}
