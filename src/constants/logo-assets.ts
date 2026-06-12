// Logos par thème (générés par scripts — voir le générateur Python du logo).
// Métro exige des require() statiques, d'où la map explicite.

import type { ThemeId } from "@/constants/themes";

export const logoByTheme: Record<ThemeId, number> = {
  honey: require("../../assets/images/logos/logo-honey.png"),
  blossom: require("../../assets/images/logos/logo-blossom.png"),
  plum: require("../../assets/images/logos/logo-plum.png"),
  water: require("../../assets/images/logos/logo-water.png"),
  sage: require("../../assets/images/logos/logo-sage.png"),
  graphite: require("../../assets/images/logos/logo-graphite.png"),
};
