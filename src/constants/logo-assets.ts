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

// NOTE : les marques transparentes (assets/images/logos/logo-<thème>.png) ne
// sont plus exposées ici. Leur map n'avait aucun appelant et ses require()
// embarquaient ~314 Ko de PNG dans le bundle. Les fichiers restent sur disque :
// ils sont produits par scripts/generate-icons-v2.mjs et consommés par
// scripts/generate-splash-v2.py au moment du build, pas à l'exécution.
