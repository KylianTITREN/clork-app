import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { fonts, typeScale, useThemeColors } from "@/constants/tokens";

type SavePillProps = {
  isDirty: boolean;
  isSaving: boolean;
  onPress: () => void;
};

/** Bouton Enregistrer/Enregistré compact des sous-pages (actif quand le formulaire change). */
export function SavePill({ isDirty, isSaving, onPress }: SavePillProps) {
  const colors = useThemeColors();
  const labelColor = isDirty ? colors.onAccent : colors.textMuted;

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
      ]}
    >
      {isSaving ? (
        <ActivityIndicator size="small" color={labelColor} />
      ) : (
        <Text style={[styles.label, { color: labelColor }]}>
          {isDirty ? "Enregistrer" : "Enregistré"}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  label: { fontSize: typeScale.caption, fontFamily: fonts.semiBold },
});
