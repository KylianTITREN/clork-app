import { Stack } from "expo-router";
import { useEffect } from "react";

import { PremiumGateSheet } from "@/components/PremiumGateSheet";
import { registerPushToken } from "@/lib/notifications";
import { useAuth } from "@/providers/auth-provider";

// Architecture v2 : plus de barre d'onglets — 2 destinations + 1 action.
// Accueil (index) ; Profil poussé via l'avatar ; « Ajouter mes horaires »
// (scan) présenté en modal plein écran depuis le CTA flottant.
export default function AppLayout() {
  const { session } = useAuth();

  useEffect(() => {
    if (session?.user.id) {
      registerPushToken(session.user.id);
    }
  }, [session?.user.id]);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="scan" options={{ presentation: "fullScreenModal" }} />
      </Stack>
      {/* Porte Premium v2 : feuille du bas globale (remplace l'Alert). */}
      <PremiumGateSheet />
    </>
  );
}
