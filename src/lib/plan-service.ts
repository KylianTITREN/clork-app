// Plan de l'utilisateur (free/premium/founder) + porte Premium réutilisable.
// Les limites qui coûtent (scans, codes, suivis) sont appliquées CÔTÉ SERVEUR ;
// ici on gate l'UI (thème, export, presets, vue équipe) avec un message clair.

import { useEffect, useState } from "react";
import { Alert } from "react-native";

import { supabase } from "./supabase";

export type Plan = "free" | "premium" | "founder";

let cachedPlan: Plan = "free";

export function isPremiumPlan(plan: Plan): boolean {
  return plan === "premium" || plan === "founder";
}

export async function fetchPlan(): Promise<Plan> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return "free";
  const { data } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", auth.user.id)
    .single<{ plan: Plan }>();
  cachedPlan = data?.plan ?? "free";
  return cachedPlan;
}

/** Mise à jour locale immédiate (après activation d'un code). */
export function setCachedPlan(plan: Plan): void {
  cachedPlan = plan;
}

/** Plan courant : valeur en cache tout de suite, rafraîchie en arrière-plan. */
export function usePlan(): Plan {
  const [plan, setPlan] = useState<Plan>(cachedPlan);
  useEffect(() => {
    let mounted = true;
    fetchPlan().then((fresh) => mounted && setPlan(fresh));
    return () => {
      mounted = false;
    };
  }, []);
  return plan;
}

/** Popin « fonction Premium » commune à tous les verrous UI. */
export function showPremiumGate(feature: string): void {
  Alert.alert(
    "Fonction Premium ⭐",
    `${feature} fait partie de Clork Premium.\n\n` +
      "L'abonnement arrive bientôt — en attendant, un code d'accès reçu de " +
      "l'équipe Clork se saisit dans Profil → Compte.",
  );
}
