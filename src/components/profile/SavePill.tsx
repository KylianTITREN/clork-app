import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import {
  fonts,
  radius,
  softShadow,
  spacing,
  typeScale,
  useThemeColors,
} from "@/constants/tokens";

type SavePillProps = {
  isDirty: boolean;
  isSaving: boolean;
  onPress: () => void;
};

/** Pilule Enregistrer/Enregistré des sous-pages (active quand le formulaire change). */
export function SavePill({ isDirty, isSaving, onPress }: SavePillProps) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      disabled={isSaving || !isDirty}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: isDirty ? colors.accent : colors.surfaceMuted,
          opacity: isSaving ? 0.5 : pressed && isDirty ? 0.85 : 1,
        },
        isDirty && softShadow,
      ]}
    >
      {isSaving ? (
        <ActivityIndicator size="small" color={colors.onAccent} />
      ) : (
        <>
          <Ionicons
            name={isDirty ? "checkmark" : "checkmark-done"}
            size={16}
            color={isDirty ? colors.onAccent : colors.textMuted}
          />
          <Text style={[styles.label, { color: isDirty ? colors.onAccent : colors.textMuted }]}>
            {isDirty ? "Enregistrer" : "Enregistré"}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 110,
    justifyContent: "center",
  },
  label: { fontSize: typeScale.caption, fontFamily: fonts.extraBold },
});
