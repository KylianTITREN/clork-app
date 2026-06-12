// Logos par thème (générés par scripts — voir le générateur Python du logo).
// Métro exige des require() statiques, d'où la map explicite.

import type { ThemeId } from "@/constants/themes";

// Icônes d'app (fond accent) — pour prévisualiser l'icône liée au thème.
export const appIconByTheme: Record<ThemeId, number> = {
  honey: require("../../assets/icons/icon-honey.png"),
  blossom: require("../../assets/icons/icon-blossom.png"),
  plum: require("../../assets/icons/icon-plum.png"),
  water: require("../../assets/icons/icon-water.png"),
  sage: require("../../assets/icons/icon-sage.png"),
  graphite: require("../../assets/icons/icon-graphite.png"),
};

export const logoByTheme: Record<ThemeId, number> = {
  honey: require("../../assets/images/logos/logo-honey.png"),
  blossom: require("../../assets/images/logos/logo-blossom.png"),
  plum: require("../../assets/images/logos/logo-plum.png"),
  water: require("../../assets/images/logos/logo-water.png"),
  sage: require("../../assets/images/logos/logo-sage.png"),
  graphite: require("../../assets/images/logos/logo-graphite.png"),
};
