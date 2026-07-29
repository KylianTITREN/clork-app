// Drapeaux locaux de l'onboarding (hors route : l'inscription, l'accueil et
// l'écran d'onboarding les partagent sans s'importer entre eux).

/** Onboarding terminé (ou passé) : ne plus jamais l'ouvrir. */
export const ONBOARDING_DONE_KEY = "clork.onboarding-done";

/**
 * Compte fraîchement créé : l'accueil doit ouvrir « BIENVENUE 1/4 » dès qu'il
 * monte. Posé à l'inscription — la bascule (auth) → (tabs) remplace la pile,
 * une navigation lancée depuis l'écran de code serait avalée.
 */
export const ONBOARDING_PENDING_KEY = "clork.onboarding-pending";
