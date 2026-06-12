// Enregistrement du token push Expo (notification de fin d'extraction).
// Silencieusement inactif sur simulateur ou tant que le projet EAS n'est pas
// configuré (le projectId arrive avec `eas init`, prévu phase stores).

import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

import { supabase } from "@/lib/supabase";

export async function registerPushToken(userId: string): Promise<void> {
  try {
    if (!Device.isDevice) return; // pas de push sur simulateur

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return; // EAS pas encore configuré

    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.from("profiles").update({ expo_push_token: token }).eq("id", userId);
  } catch (error) {
    // Le push est un confort, jamais bloquant.
    console.warn("registerPushToken failed:", error);
  }
}
