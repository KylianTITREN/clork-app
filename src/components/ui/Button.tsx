import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type ViewStyle,
} from "react-native";

import { fonts, radius, spacing, typeScale, useThemeColors } from "@/constants/tokens";

// Boutons v2 : primaire = fond primaire texte blanc r12 ; secondaire = blanc
// bordé #E8E6DE ; ink = encre (ex-« dark ») ; ghost = texte seul ; danger.
// Désactivé = fond #EBE9E2 texte #8B877A (spec), pas d'opacité fantôme.
type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "dark";
  isLoading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

export function Button({
  label,
  onPress,
  variant = "primary",
  isLoading = false,
  disabled = false,
  style,
}: ButtonProps) {
  const colors = useThemeColors();
  const isBlocked = disabled || isLoading;

  const background = isBlocked
    ? colors.surfaceMuted
    : variant === "primary"
      ? colors.accent
      : variant === "secondary"
        ? colors.surface
        : variant === "danger"
          ? colors.danger
          : variant === "dark"
            ? colors.ink
            : "transparent";
  const labelColor = isBlocked
    ? colors.textMuted
    : variant === "ghost"
      ? colors.text
      : variant === "secondary"
        ? colors.text
        : variant === "danger"
          ? "#FFFFFF"
          : variant === "dark"
            ? colors.onInk
            : colors.onAccent;
  const borderColor = variant === "secondary" && !isBlocked ? colors.border : "transparent";

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={isBlocked}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: background, borderColor, opacity: pressed && !isBlocked ? 0.88 : 1 },
        pressed && !isBlocked && styles.pressed,
        style,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator color={labelColor} />
      ) : (
        <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
    borderWidth: 1,
    // Cibles tactiles v2 : ≥ 44px, souvent ≥ 52px.
    minHeight: 52,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  label: {
    fontSize: typeScale.body,
    fontFamily: fonts.semiBold,
  },
});
