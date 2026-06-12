import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useEffect } from "react";

import { palette } from "@/constants/tokens";
import { registerPushToken } from "@/lib/notifications";
import { useAuth } from "@/providers/auth-provider";

// Tabs NATIVES (UITabBar) : sur iOS 26 elles héritent automatiquement du
// Liquid Glass système — flou, reflets, minimisation au scroll.
export default function TabsLayout() {
  const { session } = useAuth();

  useEffect(() => {
    if (session?.user.id) {
      registerPushToken(session.user.id);
    }
  }, [session?.user.id]);

  return (
    <NativeTabs tintColor={palette.accent} minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Planning</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar" drawable="ic_menu_my_calendar" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="scan">
        <NativeTabs.Trigger.Label>Scanner</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="camera.viewfinder" drawable="ic_menu_camera" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profil</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.crop.circle" drawable="ic_menu_myplaces" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
