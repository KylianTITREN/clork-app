import { Pressable, StyleSheet, Text, View } from "react-native";

import { fonts, radius, spacing, useThemeColors } from "@/constants/tokens";

type ChoiceChipsProps<T extends string | number> = {
  options: readonly { value: T; label: string }[];
  /** Valeur sélectionnée (null si aucune ne correspond). */
  value: T | null;
  onChange: (value: T) => void;
};

/** Rangée de chips à choix unique — même langage visuel que DurationChips. */
export function ChoiceChips<T extends string | number>({
  options,
  value,
  onChange,
}: ChoiceChipsProps<T>) {
  const colors = useThemeColors();

  return (
    <View style={styles.row}>
      {options.map(({ value: option, label }) => {
        const selected = option === value;
        return (
          <Pressable
            key={String(option)}
            onPress={() => onChange(option)}
            style={[
              styles.chip,
              { backgroundColor: selected ? colors.text : colors.surfaceMuted },
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: selected ? colors.background : colors.textMuted },
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
