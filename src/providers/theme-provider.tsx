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
    if (!icons.supportsAlternateIcons) return;
    const iconName =
      themeId === DEFAULT_THEME_ID
        ? null
        : themeId.charAt(0).toUpperCase() + themeId.slice(1); // catalogues en PascalCase
    try {
      await icons.setAlternateAppIcon(iconName);
    } catch (firstError) {
      // « Resource temporarily unavailable » (EAGAIN) : le démon d'icônes
      // refuse parfois pendant que l'app est active. On retente une fois
      // tout de suite, puis au prochain passage app → premier plan (moment
      // où le springboard accepte le plus fiablement).
      try {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await icons.setAlternateAppIcon(iconName);
      } catch {
        const { AppState } = require("react-native") as typeof import("react-native");
        const subscription = AppState.addEventListener("change", (state) => {
          if (state !== "active") return;
          subscription.remove();
          icons.setAlternateAppIcon(iconName).catch((retryError: unknown) => {
            console.warn("[theme] icon retry on foreground failed:", retryError);
          });
        });
        throw firstError;
      }
    }
  } catch (error) {
    // Module natif indisponible ou refus du springboard : le thème in-app
    // reste appliqué, l'icône suivra au prochain essai.
    console.warn("[theme] setAlternateAppIcon failed:", error);
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
