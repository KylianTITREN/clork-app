// Logos par thème (générés par scripts — voir le générateur Python du logo).
// Métro exige des require() statiques, d'où la map explicite.

import type { ThemeId } from "@/constants/themes";

// Icônes d'app v2 « cadran mordu » (générées par scripts/generate-icons-v2.mjs).
export const appIconByTheme: Record<ThemeId, number> = {
  forest: require("../../assets/icons/icon-forest.png"),
  honey: require("../../assets/icons/icon-honey.png"),
  blossom: require("../../assets/icons/icon-blossom.png"),
  plum: require("../../assets/icons/icon-plum.png"),
  water: require("../../assets/icons/icon-water.png"),
  graphite: require("../../assets/icons/icon-graphite.png"),
};

// Marques transparentes (cadran seul) par thème.
export const logoByTheme: Record<ThemeId, number> = {
  forest: require("../../assets/images/logos/logo-forest.png"),
  honey: require("../../assets/images/logos/logo-honey.png"),
  blossom: require("../../assets/images/logos/logo-blossom.png"),
  plum: require("../../assets/images/logos/logo-plum.png"),
  water: require("../../assets/images/logos/logo-water.png"),
  graphite: require("../../assets/images/logos/logo-graphite.png"),
};
