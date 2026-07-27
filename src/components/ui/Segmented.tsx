import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";

import { fonts, typeScale, useThemeColors } from "@/constants/tokens";

// Segmented v2 (Aujourd'hui ⇄ Semaine, Moi/Léa/…) : rail #EBE9E2 r10,
// segment actif = encre + texte clair. Réponse optimiste immédiate.
type SegmentedProps<T extends string> = {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Rail posé sur le header sombre : actif = fond clair, encre foncée. */
  onDark?: boolean;
  style?: ViewStyle;
};

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  onDark = false,
  style,
}: SegmentedProps<T>) {
  const colors = useThemeColors();
  const railBg = onDark ? "rgba(247,246,242,0.14)" : colors.surfaceMuted;
  return (
    <View style={[styles.rail, { backgroundColor: railBg }, style]}>
      {options.map((option) => {
        const isActive = option.value === value;
        const activeBg = onDark ? colors.onInk : colors.ink;
        const activeColor = onDark ? colors.ink : colors.onInk;
        const idleColor = onDark ? "rgba(247,246,242,0.75)" : "#6E6A5E";
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, isActive && { backgroundColor: activeBg }]}
          >
            <Text
              style={[
                styles.label,
                { color: isActive ? activeColor : idleColor },
                isActive && styles.labelActive,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    flexDirection: "row",
    borderRadius: 10,
    padding: 3,
    alignSelf: "flex-start",
  },
  segment: {
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 16,
  },
  label: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
  },
  labelActive: {
    fontFamily: fonts.semiBold,
  },
});
