import { Pressable, StyleSheet, Text, View } from "react-native";

import { fonts, radius, spacing, useThemeColors } from "@/constants/tokens";

const PRESETS: { minutes: number; label: string }[] = [
  { minutes: 0, label: "Aucune" },
  { minutes: 30, label: "30 min" },
  { minutes: 45, label: "45 min" },
  { minutes: 60, label: "1h" },
  { minutes: 90, label: "1h30" },
  { minutes: 120, label: "2h" },
];

type DurationChipsProps = {
  /** Durée sélectionnée en minutes. */
  value: number;
  onChange: (minutes: number) => void;
  /** Rendu sur carte pastel (fonds translucides, encre). */
  compact?: boolean;
};

/** Sélecteur de durée de pause en chips — fini la saisie au clavier. */
export function DurationChips({ value, onChange, compact = false }: DurationChipsProps) {
  const colors = useThemeColors();
  const ink = "#26210E";

  return (
    <View style={styles.row}>
      {PRESETS.map(({ minutes, label }) => {
        const selected = value === minutes;
        return (
          <Pressable
            key={minutes}
            onPress={() => onChange(minutes)}
            style={[
              styles.chip,
              {
                backgroundColor: selected
                  ? compact
                    ? ink
                    : colors.text
                  : compact
                    ? "rgba(255,255,255,0.65)"
                    : colors.surfaceMuted,
              },
            ]}
          >
            <Text
              style={[
                styles.label,
                {
                  color: selected
                    ? compact
                      ? "#FFF"
                      : colors.background
                    : compact
                      ? "rgba(38,33,14,0.65)"
                      : colors.textMuted,
                },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  chip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 1,
  },
  label: {
    fontSize: 12,
    fontFamily: fonts.bold,
  },
});
