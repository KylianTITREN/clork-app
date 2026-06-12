import { Stack } from "expo-router";

import { useThemeColors } from "@/constants/tokens";

export default function ProfileLayout() {
  const colors = useThemeColors();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
