import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

import { fonts, radius, spacing, typeScale, useThemeColors } from "@/constants/tokens";

type TextFieldProps = TextInputProps & {
  label: string;
  hint?: string;
};

export function TextField({ label, hint, style, ...inputProps }: TextFieldProps) {
  const colors = useThemeColors();

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={[
          styles.input,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            color: colors.text,
          },
          style,
        ]}
        {...inputProps}
      />
      {hint ? (
        <Text style={[styles.hint, { color: colors.textMuted }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    fontSize: typeScale.caption,
    fontFamily: fonts.bold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: typeScale.body,
    fontFamily: fonts.semiBold,
    minHeight: 52,
  },
  hint: {
    fontSize: typeScale.caption,
    fontFamily: fonts.regular,
  },
});
