import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ctaShadow, fonts, radius, spacing, typeScale, useThemeColors } from "@/constants/tokens";

// CTA flottant v2 : pilule primaire pleine largeur en bas d'écran, posée sur
// un dégradé qui fond la liste (linear-gradient rgba(fond,0) → fond 55%).
type FloatingCTAProps = {
  label: string;
  onPress: () => void;
};

export function FloatingCTA({ label, onPress }: FloatingCTAProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient
      colors={["rgba(247,246,242,0)", colors.background]}
      locations={[0, 0.55]}
      style={[styles.gradient, { paddingBottom: insets.bottom + spacing.sm }]}
      pointerEvents="box-none"
    >
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          ctaShadow,
          { backgroundColor: colors.accent },
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.label, { color: colors.onAccent }]}>{label}</Text>
      </Pressable>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  button: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    minHeight: 54,
    paddingVertical: 15,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.92,
  },
  label: {
    fontSize: typeScale.body,
    fontFamily: fonts.semiBold,
  },
});
