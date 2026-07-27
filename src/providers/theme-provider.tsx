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
  migrateThemeId,
  setActiveAccentFamily,
  type ThemeId,
} from "@/constants/themes";

const STORAGE_KEY = "clork.theme";
// Toggle « L'icône de l'app suit le thème » (Apparence). "0" = désactivé,
// tout le reste (clé absente incluse) = activé.
const ICON_FOLLOWS_THEME_KEY = "clork.icon-follows-theme";

// Dernier thème appliqué, lisible hors React pour setIconFollowsTheme().
let currentThemeId: ThemeId = DEFAULT_THEME_ID;

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
    // Forêt (défaut) = icône principale ; les autres thèmes = catalogues
    // alternatifs en PascalCase (assets v2 « cadran mordu »).
    const iconName =
      themeId === DEFAULT_THEME_ID
        ? null
        : themeId.charAt(0).toUpperCase() + themeId.slice(1);
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

/** Lit la préférence « l'icône suit le thème » (défaut : activé). */
export async function getIconFollowsTheme(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ICON_FOLLOWS_THEME_KEY)) !== "0";
  } catch {
    return true;
  }
}

/** Applique l'icône du thème seulement si la préférence l'autorise. */
async function applyAlternateAppIconIfEnabled(themeId: ThemeId): Promise<void> {
  const isEnabled = await getIconFollowsTheme();
  if (!isEnabled) return;
  await applyAlternateAppIcon(themeId);
}

/**
 * Persiste la préférence « l'icône suit le thème » et, à la réactivation,
 * ré-aligne immédiatement l'icône sur le thème courant.
 */
export function setIconFollowsTheme(enabled: boolean): void {
  AsyncStorage.setItem(ICON_FOLLOWS_THEME_KEY, enabled ? "1" : "0").catch(() => {
    // Persistance impossible : la préférence vaut pour la session en cours.
  });
  if (enabled) {
    applyAlternateAppIcon(currentThemeId);
  }
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [themeId, setThemeIdState] = useState<ThemeId>(DEFAULT_THEME_ID);
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydratation depuis AsyncStorage (clé `clork.theme`).
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        // migrateThemeId : « sage » (v1) → « forest » (v2), IDs inconnus ignorés.
        const migrated = stored ? migrateThemeId(stored) : null;
        if (migrated) {
          // Pont module-level mis à jour avant le re-rendu (voir themes.ts).
          setActiveAccentFamily(migrated);
          currentThemeId = migrated;
          setThemeIdState(migrated);
          if (migrated !== stored) {
            AsyncStorage.setItem(STORAGE_KEY, migrated).catch(() => {});
          }
        }
      })
      .catch(() => {
        // Lecture impossible : on reste sur le thème par défaut.
      })
      .finally(() => setIsHydrated(true));
  }, []);

  const setThemeId = useCallback((next: ThemeId) => {
    setActiveAccentFamily(next);
    currentThemeId = next;
    setThemeIdState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // Persistance impossible : le thème reste appliqué pour la session.
    });
    applyAlternateAppIconIfEnabled(next);
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
