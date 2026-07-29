// Sans ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS = YES, Xcode ne compile
// QUE l'icône principale dans Assets.car : les icônes alternatives (une par
// thème) sont absentes du binaire et setAlternateIconName échoue à l'exécution
// avec « Resource temporarily unavailable ».
//
// expo-alternate-app-icons ne pose que ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES.
// Le réglage était donc ajouté À LA MAIN après chaque prebuild local — ce qui ne
// survit pas à un build EAS, où le prebuild est refait à distance. Ce plugin le
// pose à chaque prebuild, local comme cloud.

const { withXcodeProject } = require("expo/config-plugins");

const SETTING = "ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS";

module.exports = function withIncludeAllAppIcons(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const configurations = project.pbxXCBuildConfigurationSection();

    for (const key of Object.keys(configurations)) {
      const entry = configurations[key];
      // Les clés « _comment » doublonnent chaque entrée : on les ignore.
      if (!entry || typeof entry !== "object" || !entry.buildSettings) continue;
      const settings = entry.buildSettings;
      // Uniquement les cibles applicatives (celles qui portent une icône) —
      // inutile de polluer les cibles de bibliothèque.
      if (settings.ASSETCATALOG_COMPILER_APPICON_NAME == null) continue;
      settings[SETTING] = "YES";
    }

    return cfg;
  });
};
