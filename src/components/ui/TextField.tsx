import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

import { fonts, radius, spacing, typeScale, useThemeColors } from "@/constants/tokens";

type TextFieldProps = TextInputProps & {
  label: string;
  hint?: string;
  /** Champ mot de passe avec œil pour afficher/masquer. */
  secureToggle?: boolean;
};

export function TextField({ label, hint, style, secureToggle, ...inputProps }: TextFieldProps) {
  const colors = useThemeColors();
  const [isHidden, setIsHidden] = useState(true);

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      <View>
        <TextInput
          placeholderTextColor={colors.textMuted}
          secureTextEntry={secureToggle ? isHidden : inputProps.secureTextEntry}
          style={[
            styles.input,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              color: colors.text,
            },
            secureToggle && styles.inputWithEye,
            style,
          ]}
          {...inputProps}
        />
        {secureToggle ? (
          <Pressable
            onPress={() => setIsHidden((v) => !v)}
            hitSlop={10}
            style={styles.eye}
            accessibilityLabel={isHidden ? "Afficher le mot de passe" : "Masquer le mot de passe"}
          >
            <Ionicons
              name={isHidden ? "eye-outline" : "eye-off-outline"}
              size={20}
              color={colors.textMuted}
            />
          </Pressable>
        ) : null}
      </View>
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
  inputWithEye: {
    paddingRight: 48,
  },
  eye: {
    position: "absolute",
    right: 16,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
});
