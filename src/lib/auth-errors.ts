// Traduit les erreurs Supabase Auth (anglais technique) en messages
// français actionnables. Fallback générique : on ne montre jamais le
// message brut de l'API à l'utilisateur.

import { AuthError } from "@supabase/supabase-js";

const MESSAGES: Record<string, string> = {
  invalid_credentials:
    "Email ou mot de passe incorrect. Vérifie ta saisie, ou crée un compte si tu n'en as pas encore.",
  email_not_confirmed:
    "Ton email n'est pas encore confirmé. Ouvre le lien reçu par email puis reconnecte-toi.",
  user_already_exists:
    "Un compte existe déjà avec cet email. Connecte-toi plutôt, ou utilise un autre email.",
  email_exists:
    "Un compte existe déjà avec cet email. Connecte-toi plutôt, ou utilise un autre email.",
  weak_password: "Mot de passe trop faible : 8 caractères minimum.",
  same_password: "Le nouveau mot de passe doit être différent de l'actuel.",
  over_request_rate_limit:
    "Trop de tentatives. Patiente une minute avant de réessayer.",
  user_not_found: "Aucun compte trouvé avec cet email.",
  validation_failed: "Email invalide. Vérifie le format (ex. prenom@mail.fr).",
};

export function authErrorMessage(error: unknown): string {
  if (error instanceof AuthError && error.code && MESSAGES[error.code]) {
    return MESSAGES[error.code];
  }
  const raw = error instanceof Error ? error.message : "";
  if (/network|fetch/i.test(raw)) {
    return "Pas de connexion internet. Vérifie ton réseau et réessaie.";
  }
  return "Une erreur est survenue. Réessaie dans un instant.";
}
