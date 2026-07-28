import { Pressable, StyleSheet, Text, View } from "react-native";

import { fonts, typeScale, useThemeColors } from "@/constants/tokens";

type ChoiceChipsProps<T extends string | number> = {
  options: readonly { value: T; label: string }[];
  /** Valeur sélectionnée (null si aucune ne correspond). */
  value: T | null;
  onChange: (value: T) => void;
};

/**
 * Rangée de chips à choix unique — langage v2 : sélection = ENCRE (fond ink,
 * texte onInk), sinon carte blanche bordée texte #55524A. Le vert est réservé
 * aux CTA/validation (décision maquette). Cibles ≥ 44px.
 */
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
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option)}
            style={[
              styles.chip,
              selected
                ? { backgroundColor: colors.ink, borderColor: colors.ink }
                : { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text
              style={[
                styles.label,
                selected
                  ? [styles.labelSelected, { color: colors.onInk }]
                  : { color: colors.textSoft },
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
    gap: 8,
  },
  chip: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 44,
    justifyContent: "center",
  },
  label: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
  },
  labelSelected: {
    fontFamily: fonts.semiBold,
  },
});
