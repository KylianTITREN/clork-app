// Thèmes Clork v2 — six familles d'accent interchangeables (DA « épurée & pro »).
// Chaque famille suit la spec handoff v2 : [primaire, fond doux, variante claire]
// → accent / accentMuted / accentSoft, complétés d'un accentDeep (texte sur fond
// clair) et des couleurs du créneau « travail ». Le primaire est toujours assez
// foncé pour porter du texte BLANC (boutons v2 : fond primaire, texte blanc).
// Les autres couleurs sémantiques (types, danger, encre) vivent dans tokens.ts.

export type ThemeId = "forest" | "honey" | "blossom" | "plum" | "water" | "graphite";

export const DEFAULT_THEME_ID: ThemeId = "forest";

export type AccentFamily = {
  /** Couleur primaire (boutons, toggles, dots, barres de progression, hero). */
  accent: string;
  /** Déclinaison foncée lisible pour textes/icônes sur fond clair. */
  accentDeep: string;
  /** Variante claire (barres, accents secondaires, label hero header sombre). */
  accentSoft: string;
  /** Fond doux très clair (chips actives, pastilles, cartes promo). */
  accentMuted: string;
  /** Couleur forte du créneau « travail » (dots, barres) — suit le primaire. */
  shiftWork: string;
  /** Fond pastel du créneau « travail » (chips, cartes). */
  shiftWorkSoft: string;
  /** Encre posée SUR l'accent — blanc partout en v2 (primaires foncés). */
  onAccent: string;
};

export const themes: Record<ThemeId, AccentFamily> = {
  // Vert forêt — défaut v2 (« l'encre fait le travail, plus de jaune signal »).
  forest: {
    accent: "#1F6B47",
    accentDeep: "#174F35",
    accentSoft: "#7BC79C",
    accentMuted: "#E4F0E8",
    shiftWork: "#1F6B47",
    shiftWorkSoft: "#E4F0E8",
    onAccent: "#FFFFFF",
  },
  // Miel — doré assombri v2 (ex-#FFC233 ; alias legacy #A87900 → Miel).
  honey: {
    accent: "#D19E00",
    accentDeep: "#A87900",
    accentSoft: "#FFD877",
    accentMuted: "#FFF3D6",
    shiftWork: "#D19E00",
    shiftWorkSoft: "#FFF3D6",
    onAccent: "#FFFFFF",
  },
  // Rose — saturé v2 (ex-pastel #F9A8C9 ; alias legacy #B5447C → Rose).
  blossom: {
    accent: "#ED72A8",
    accentDeep: "#B5447C",
    accentSoft: "#FBC7DB",
    accentMuted: "#FDEAF2",
    shiftWork: "#ED72A8",
    shiftWorkSoft: "#FDEAF2",
    onAccent: "#FFFFFF",
  },
  // Prune.
  plum: {
    accent: "#6C4BAC",
    accentDeep: "#4E3582",
    accentSoft: "#A98FD6",
    accentMuted: "#EDE7F8",
    shiftWork: "#6C4BAC",
    shiftWorkSoft: "#EDE7F8",
    onAccent: "#FFFFFF",
  },
  // Bleu eau — assombri v2 (ex-#7EC8E3).
  water: {
    accent: "#2E7795",
    accentDeep: "#1F5468",
    accentSoft: "#A9DCEF",
    accentMuted: "#E3F4FA",
    shiftWork: "#2E7795",
    shiftWorkSoft: "#E3F4FA",
    onAccent: "#FFFFFF",
  },
  // Gris anthracite.
  graphite: {
    accent: "#4A4A52",
    accentDeep: "#2F2F36",
    accentSoft: "#9A9AA6",
    accentMuted: "#EAEAEE",
    shiftWork: "#4A4A52",
    shiftWorkSoft: "#EAEAEE",
    onAccent: "#FFFFFF",
  },
};

/** Ordre d'affichage des pastilles dans les réglages. */
export const themeOrder: readonly ThemeId[] = [
  "forest",
  "honey",
  "blossom",
  "plum",
  "water",
  "graphite",
];

/** Libellés FR affichés dans les réglages. */
export const themeLabels: Record<ThemeId, string> = {
  forest: "Forêt",
  honey: "Miel",
  blossom: "Rose",
  plum: "Prune",
  water: "Eau",
  graphite: "Anthracite",
};

export function isThemeId(value: string): value is ThemeId {
  return value in themes;
}

/**
 * Migre un themeId persisté avant la v2 : « sage » (vert satin) a disparu au
 * profit de « forest » (nouveau défaut). Les autres IDs sont conservés — seules
 * leurs valeurs de couleurs ont changé.
 */
export function migrateThemeId(stored: string): ThemeId | null {
  if (stored === "sage") return "forest";
  return isThemeId(stored) ? stored : null;
}

// ---------------------------------------------------------------------------
// Pont module-level pour les consts statiques (shiftTypeColor & co dans
// tokens.ts) consommées par des écrans non migrés vers useThemeColors().
// Le ThemeProvider met à jour cette valeur AVANT le setState React : les
// re-rendus déclenchés par le contexte relisent donc la bonne famille via
// les getters de tokens.ts. Mutation volontaire et contenue ici.
// ---------------------------------------------------------------------------

let activeAccentFamily: AccentFamily = themes[DEFAULT_THEME_ID];

export function setActiveAccentFamily(themeId: ThemeId): void {
  activeAccentFamily = themes[themeId];
}

export function getActiveAccentFamily(): AccentFamily {
  return activeAccentFamily;
}
