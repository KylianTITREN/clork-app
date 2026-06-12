import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type ViewStyle,
} from "react-native";

import { fonts, radius, spacing, typeScale, useThemeColors } from "@/constants/tokens";

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "ghost" | "danger" | "dark";
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

  const background =
    variant === "primary"
      ? colors.accent
      : variant === "danger"
        ? colors.danger
        : variant === "dark"
          ? colors.text
          : "transparent";
  const labelColor =
    variant === "ghost"
      ? colors.text
      : variant === "danger"
        ? "#FFFFFF"
        : variant === "dark"
          ? colors.background
          : colors.onAccent;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={isBlocked}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: background, opacity: isBlocked ? 0.5 : pressed ? 0.85 : 1 },
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
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    minHeight: 54,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  label: {
    fontSize: typeScale.body,
    fontFamily: fonts.extraBold,
  },
});
