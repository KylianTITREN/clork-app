// Thèmes Clork — six familles d'accent interchangeables.
// Chaque thème redéfinit UNIQUEMENT la famille d'accent (accent, déclinaisons,
// couleurs du créneau « travail ») + la couleur d'encre posée sur l'accent.
// Les autres couleurs sémantiques (rh/cp/meeting/off, danger, success,
// backgrounds, text) restent communes — voir tokens.ts.

export type ThemeId = "honey" | "blossom" | "plum" | "water" | "sage" | "graphite";

export const DEFAULT_THEME_ID: ThemeId = "honey";

export type AccentFamily = {
  /** Couleur d'accent principale (boutons, avatar, pastilles). */
  accent: string;
  /** Déclinaison foncée lisible pour textes/icônes sur fond clair. */
  accentDeep: string;
  /** Déclinaison claire (hover, surfaces actives). */
  accentSoft: string;
  /** Fond pastel très clair (pastilles d'icônes, cartes promo). */
  accentMuted: string;
  /** Couleur forte du créneau « travail » (dots, sélecteurs). */
  shiftWork: string;
  /** Fond pastel du créneau « travail » (cartes). */
  shiftWorkSoft: string;
  /** Encre posée SUR l'accent (foncée sur accents clairs, claire sur accents foncés). */
  onAccent: string;
};

export const themes: Record<ThemeId, AccentFamily> = {
  // Jaune miel — DA d'origine (Timezy-like, décision Kylian 2026-06-12).
  honey: {
    accent: "#FFC233",
    accentDeep: "#A87900",
    accentSoft: "#FFD877",
    accentMuted: "#FFF3D6",
    shiftWork: "#E8A800",
    shiftWorkSoft: "#FCEFC7",
    onAccent: "#26210E",
  },
  // Rose pastel.
  blossom: {
    accent: "#F9A8C9",
    accentDeep: "#B5447C",
    accentSoft: "#FBC7DB",
    accentMuted: "#FDEAF2",
    shiftWork: "#ED72A8",
    shiftWorkSoft: "#FBE0EC",
    onAccent: "#2E1220",
  },
  // Violet prune — accent foncé, encre claire.
  plum: {
    accent: "#7C5CB8",
    accentDeep: "#4E3582",
    accentSoft: "#A98FD6",
    accentMuted: "#EDE7F8",
    shiftWork: "#6C4BAC",
    shiftWorkSoft: "#E9E2F6",
    onAccent: "#FFF8F2",
  },
  // Bleu eau.
  water: {
    accent: "#7EC8E3",
    accentDeep: "#2E7795",
    accentSoft: "#A9DCEF",
    accentMuted: "#E3F4FA",
    shiftWork: "#4FA9CC",
    shiftWorkSoft: "#DCEFF7",
    onAccent: "#0E2530",
  },
  // Vert satin (sauge).
  sage: {
    accent: "#9CC5A1",
    accentDeep: "#44704B",
    accentSoft: "#BDD9C1",
    accentMuted: "#E9F3EA",
    shiftWork: "#6FA478",
    shiftWorkSoft: "#E1EFE3",
    onAccent: "#14261A",
  },
  // Gris anthracite — accent foncé, encre claire.
  graphite: {
    accent: "#4A4A52",
    accentDeep: "#26262C",
    accentSoft: "#73737E",
    accentMuted: "#EBEBEF",
    shiftWork: "#5A5A64",
    shiftWorkSoft: "#E6E6EB",
    onAccent: "#F4F2E8",
  },
};

/** Ordre d'affichage des pastilles dans les réglages. */
export const themeOrder: readonly ThemeId[] = [
  "honey",
  "blossom",
  "plum",
  "water",
  "sage",
  "graphite",
];

/** Libellés FR affichés dans les réglages. */
export const themeLabels: Record<ThemeId, string> = {
  honey: "Miel",
  blossom: "Rose",
  plum: "Prune",
  water: "Eau",
  sage: "Sauge",
  graphite: "Anthracite",
};

export function isThemeId(value: string): value is ThemeId {
  return value in themes;
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
