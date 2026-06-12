import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";

import {
  DEFAULT_THEME_ID,
  isThemeId,
  setActiveAccentFamily,
  type ThemeId,
} from "@/constants/themes";

const STORAGE_KEY = "clork.theme";

type ThemeContextValue = {
  themeId: ThemeId;
  setThemeId: (themeId: ThemeId) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  themeId: DEFAULT_THEME_ID,
  setThemeId: () => {},
});

/**
 * Icône d'app alternative (iOS) alignée sur le thème. Best effort : le module
 * natif est absent dans Expo Go / web, et l'OS peut refuser — silencieux.
 */
async function applyAlternateAppIcon(themeId: ThemeId): Promise<void> {
  try {
    // require synchrone plutôt qu'import() : les requires asynchrones cassent
    // au hot reload de Metro (« Requiring unknown module »).
    const icons = require("expo-alternate-app-icons") as typeof import("expo-alternate-app-icons");
    if (!icons.supportsAlternateIcons) {
      if (__DEV__) {
        const { Alert } = require("react-native") as typeof import("react-native");
        Alert.alert("[dev] Icône", "supportsAlternateIcons = false sur cette build");
      }
      return;
    }
    const iconName =
      themeId === DEFAULT_THEME_ID
        ? null
        : themeId.charAt(0).toUpperCase() + themeId.slice(1); // catalogues en PascalCase
    await icons.setAlternateAppIcon(iconName);
    if (__DEV__) {
      const { Alert } = require("react-native") as typeof import("react-native");
      Alert.alert("[dev] Icône", `setAlternateAppIcon(${iconName ?? "null"}) OK → active : ${icons.getAppIconName() ?? "défaut"}`);
    }
  } catch (error) {
    // Module natif indisponible : le thème in-app reste appliqué.
    console.warn("[theme] setAlternateAppIcon failed:", error);
    if (__DEV__) {
      const { Alert } = require("react-native") as typeof import("react-native");
      Alert.alert("[dev] Icône — échec", String(error));
    }
  }
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [themeId, setThemeIdState] = useState<ThemeId>(DEFAULT_THEME_ID);
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydratation depuis AsyncStorage (clé `clork.theme`).
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored && isThemeId(stored)) {
          // Pont module-level mis à jour avant le re-rendu (voir themes.ts).
          setActiveAccentFamily(stored);
          setThemeIdState(stored);
        }
      })
      .catch(() => {
        // Lecture impossible : on reste sur le thème par défaut.
      })
      .finally(() => setIsHydrated(true));
  }, []);

  const setThemeId = useCallback((next: ThemeId) => {
    setActiveAccentFamily(next);
    setThemeIdState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // Persistance impossible : le thème reste appliqué pour la session.
    });
    applyAlternateAppIcon(next);
  }, []);

  // AsyncStorage répond en quelques ms : on évite un flash du thème par défaut.
  if (!isHydrated) {
    return null;
  }

  return (
    <ThemeContext.Provider value={{ themeId, setThemeId }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
