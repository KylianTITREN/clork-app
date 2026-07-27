// Design tokens Clork v2 — source unique pour couleurs, typo, espacements.
// DA v2 « épurée & pro » (handoff 2026-07-27) : Instrument Sans, neutres froids
// (fond #F7F6F2, encre #17150E), primaire du thème (défaut vert forêt #1F6B47),
// rayons contenus (11-16px), ombres quasi nulles, hiérarchie par la typo et
// l'espace. L'encre fait le travail — plus de jaune signal partout.

import { useColorScheme } from "react-native";

import {
  DEFAULT_THEME_ID,
  getActiveAccentFamily,
  themes,
  type ThemeId,
} from "@/constants/themes";
import { useTheme } from "@/providers/theme-provider";

/**
 * @deprecated Encre posée sur l'accent du thème PAR DÉFAUT uniquement.
 * Utiliser `useThemeColors().onAccent` qui suit le thème actif.
 */
export const inkOnAccent = themes[DEFAULT_THEME_ID].onAccent;

export const palette = {
  // Famille d'accent du thème PAR DÉFAUT (forêt). Pour une UI thémée,
  // passer par useThemeColors() — ces clés statiques ne suivent pas le thème.
  accent: themes[DEFAULT_THEME_ID].accent,
  accentDeep: themes[DEFAULT_THEME_ID].accentDeep,
  accentSoft: themes[DEFAULT_THEME_ID].accentSoft,
  accentMuted: themes[DEFAULT_THEME_ID].accentMuted,

  // Types de créneau : couleur forte (dots, textes) + fond doux (chips).
  // work suit le thème via shiftTypeColor/shiftTypeSoftColor (getters plus bas).
  shiftWork: themes[DEFAULT_THEME_ID].shiftWork,
  shiftWorkSoft: themes[DEFAULT_THEME_ID].shiftWorkSoft,
  shiftOff: "#8B877A",
  shiftOffSoft: "#F7F6F2",
  shiftRh: "#2FA877",
  shiftRhSoft: "#DFF4EA",
  shiftCp: "#EE8A3B",
  shiftCpSoft: "#FCE9D9",
  shiftLeave: "#EE8A3B",
  shiftLeaveSoft: "#FCE9D9",
  // Réunion = violet v2 (maquette : « Réunion · 2h » en #7C5CB8).
  shiftMeeting: "#7C5CB8",
  shiftMeetingSoft: "#EDE7F8",

  danger: "#D64545",
  dangerBorder: "#E8C7C7",
  success: "#2FA877",
} as const;

export type ThemeColors = Record<
  | "background"
  | "surface"
  | "surfaceMuted"
  | "border"
  | "separator"
  | "text"
  | "textSoft"
  | "textMuted"
  | "textDisabled"
  | "ink"
  | "onInk"
  | "onAccent"
  | keyof typeof palette,
  string
>;

export const lightColors: ThemeColors = {
  background: "#F7F6F2", // neutre froid v2
  surface: "#FFFFFF",
  surfaceMuted: "#EBE9E2", // fond segmented, boutons désactivés
  border: "#E8E6DE",
  separator: "#EFEDE6",
  text: "#17150E", // encre v2
  textSoft: "#55524A", // texte secondaire fort (corps, chips inactives)
  textMuted: "#8B877A",
  textDisabled: "#B5B1A4",
  // Surfaces d'encre : header sombre de l'accueil/profil, boutons encre.
  ink: "#17150E",
  onInk: "#F7F6F2",
  onAccent: themes[DEFAULT_THEME_ID].onAccent,
  ...palette,
};

export const darkColors: ThemeColors = {
  background: "#14130E",
  surface: "#1E1C15",
  surfaceMuted: "#2A2820",
  border: "#35322A",
  separator: "#2A2820",
  text: "#F4F2E8",
  textSoft: "#C9C5B8",
  textMuted: "#A8A493",
  textDisabled: "#6E6A5E",
  // En sombre, les surfaces « encre » restent plus claires que le fond.
  ink: "#2A2820",
  onInk: "#F4F2E8",
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

// Rayons v2 — contenus : inputs 11, boutons 12, cartes 14-16, header hero 36.
export const radius = {
  input: 11,
  sm: 12,
  md: 14,
  lg: 16,
  hero: 36,
  pill: 999,
} as const;

// Échelle v2 : titres écran 26/700, sections 19/700, corps 13.5-14.5,
// légendes 11-12.5. `hero` = horaire géant de l'accueil (42/700).
export const typeScale = {
  hero: 42,
  title: 26,
  heading: 19,
  body: 14.5,
  bodySm: 13.5,
  caption: 12.5,
  tiny: 11,
} as const;

// Instrument Sans (chargée dans le layout racine) — graisses contenues 400-700.
// Les clés legacy black/extraBold pointent sur 700 : Instrument Sans n'a pas
// plus gras, et la DA v2 assume des graisses contenues.
export const fonts = {
  black: "InstrumentSans_700Bold",
  extraBold: "InstrumentSans_700Bold",
  bold: "InstrumentSans_700Bold",
  semiBold: "InstrumentSans_600SemiBold",
  medium: "InstrumentSans_500Medium",
  regular: "InstrumentSans_400Regular",
} as const;

// Espacement de lettres des titres v2 (26px → -0.8 ; sections → -0.4).
export const letterSpacing = {
  title: -0.8,
  heading: -0.4,
} as const;

// v2 : ombres quasi nulles sur les cartes (la bordure fait le travail).
export const softShadow = {
  shadowColor: "#17150E",
  shadowOpacity: 0.04,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 1,
} as const;

// Ombre du CTA flottant « + Ajouter mes horaires » (pilule primaire).
export const ctaShadow = {
  shadowColor: "#17150E",
  shadowOpacity: 0.18,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 6,
} as const;

export type ShiftType =
  | "work"
  | "off"
  | "rh" // legacy : encore produit par l'extraction des plannings papier
  | "cp"
  | "leave" // legacy : idem
  | "meeting"
  | "training"
  | "opening"
  | "closing"
  | "rtt"
  | "sick"
  | "absent"
  | "unpaid"
  | "overtime";

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
  training: "#4D9DE0",
  opening: "#F2994A",
  closing: "#5C6BC0",
  rtt: "#2BB3A3",
  sick: "#E25555",
  absent: "#8A8A8A",
  unpaid: "#A98467",
  overtime: "#9B59B6",
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
  training: "#DEEDFA",
  opening: "#FCE8D5",
  closing: "#E2E5F6",
  rtt: "#D7F1EE",
  sick: "#FADCDC",
  absent: "#ECECEC",
  unpaid: "#EFE4DB",
  overtime: "#EDDFF4",
};

export const shiftTypeLabel: Record<ShiftType, string> = {
  work: "Travail",
  off: "Repos",
  rh: "RH",
  cp: "Congé payé",
  leave: "Congé",
  meeting: "Réunion",
  training: "Formation",
  opening: "Ouverture",
  closing: "Fermeture",
  rtt: "RTT",
  sick: "Malade",
  absent: "Absent",
  unpaid: "Congé sans solde",
  overtime: "Heures supp",
};

export type ShiftPeriod = "morning" | "day" | "evening" | "afternoon" | "opening" | "closing";

export const shiftPeriodLabels: Record<ShiftPeriod, string> = {
  morning: "Matin",
  day: "Jour",
  evening: "Soir",
  afternoon: "Après-midi",
  opening: "Ouverture",
  closing: "Fermeture",
};

/** Poste déduit des horaires : Matin / Après-midi / Journée. */
export function shiftPeriodLabel(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  if (end <= "13:30") return "Matin";
  if (start >= "12:00") return "Après-midi";
  return "Journée";
}
