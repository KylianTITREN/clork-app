// Design tokens Clork — source unique pour couleurs, typo, espacements.
// DA actée (Kylian, captures Dribbble du 2026-06-12) : style « Timezy »
// transposé en violet — fond lavande pastel, cartes crème/pastel très
// arrondies à encre foncée, typo ronde (Nunito), ombres douces.

import { useColorScheme } from "react-native";

import {
  DEFAULT_THEME_ID,
  getActiveAccentFamily,
  themes,
  type ThemeId,
} from "@/constants/themes";
import { useTheme } from "@/providers/theme-provider";

/**
 * @deprecated Encre posée sur l'accent du thème PAR DÉFAUT (miel) uniquement.
 * Utiliser `useThemeColors().onAccent` qui suit le thème actif (les thèmes
 * prune/anthracite ont une encre CLAIRE). Conservé pour compatibilité.
 */
export const inkOnAccent = themes[DEFAULT_THEME_ID].onAccent;

export const palette = {
  // Famille d'accent du thème PAR DÉFAUT (miel). Pour une UI thémée,
  // passer par useThemeColors() — ces clés statiques ne suivent pas le thème.
  accent: themes[DEFAULT_THEME_ID].accent,
  accentDeep: themes[DEFAULT_THEME_ID].accentDeep,
  accentSoft: themes[DEFAULT_THEME_ID].accentSoft,
  accentMuted: themes[DEFAULT_THEME_ID].accentMuted,

  // Types de créneau : couleur forte (dots) + fond pastel (cartes),
  // texte toujours en encre — signature Timezy. work/workSoft suivent
  // le thème via shiftTypeColor/shiftTypeSoftColor (getters plus bas).
  shiftWork: themes[DEFAULT_THEME_ID].shiftWork,
  shiftWorkSoft: themes[DEFAULT_THEME_ID].shiftWorkSoft,
  shiftOff: "#9BA1A0",
  shiftOffSoft: "#F0EFEA",
  shiftRh: "#2FA877",
  shiftRhSoft: "#DFF4EA",
  shiftCp: "#EE8A3B",
  shiftCpSoft: "#FCE9D9",
  shiftLeave: "#EE8A3B",
  shiftLeaveSoft: "#FCE9D9",
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
  | "onAccent"
  | keyof typeof palette,
  string
>;

export const lightColors: ThemeColors = {
  background: "#F7F5EE", // crème chaud, neutre
  surface: "#FFFFFF",
  surfaceMuted: "#F1EEE3",
  border: "#E6E2D4",
  text: "#221F15", // encre chaude
  textMuted: "#75705F",
  onAccent: themes[DEFAULT_THEME_ID].onAccent,
  ...palette,
};

export const darkColors: ThemeColors = {
  background: "#191712",
  surface: "#23211A",
  surfaceMuted: "#2D2A21",
  border: "#3C382B",
  text: "#F4F2E8",
  textMuted: "#A8A493",
  onAccent: themes[DEFAULT_THEME_ID].onAccent,
  ...palette,
};

// Cache des fusions base × thème : identité stable pour éviter de casser
// d'éventuelles dépendances (useMemo/useEffect) sur l'objet retourné.
const mergedColorsCache = new Map<string, ThemeColors>();

function resolveColors(isDark: boolean, themeId: ThemeId): ThemeColors {
  const cacheKey = `${isDark ? "dark" : "light"}:${themeId}`;
  const cached = mergedColorsCache.get(cacheKey);
  if (cached) return cached;
  const merged: ThemeColors = {
    ...(isDark ? darkColors : lightColors),
    ...themes[themeId],
  };
  mergedColorsCache.set(cacheKey, merged);
  return merged;
}

export function useThemeColors(): ThemeColors {
  const isDark = useColorScheme() === "dark";
  const { themeId } = useTheme();
  return resolveColors(isDark, themeId);
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
  shadowColor: "#4A4430",
  shadowOpacity: 0.08,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 3,
} as const;

export type ShiftType = "work" | "off" | "rh" | "cp" | "leave" | "meeting";

// `work` suit le thème actif via un getter (pont module-level, voir themes.ts) :
// les écrans qui lisent ces maps à chaque rendu récupèrent la bonne couleur
// après un changement de thème, sans migration.
export const shiftTypeColor: Record<ShiftType, string> = {
  get work() {
    return getActiveAccentFamily().shiftWork;
  },
  off: palette.shiftOff,
  rh: palette.shiftRh,
  cp: palette.shiftCp,
  leave: palette.shiftLeave,
  meeting: palette.shiftMeeting,
};

export const shiftTypeSoftColor: Record<ShiftType, string> = {
  get work() {
    return getActiveAccentFamily().shiftWorkSoft;
  },
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
