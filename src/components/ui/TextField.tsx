import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

import { fonts, radius, spacing, typeScale, useThemeColors } from "@/constants/tokens";

type TextFieldProps = TextInputProps & {
  label: string;
  hint?: string;
  /** Champ mot de passe avec bascule texte AFFICHER/MASQUER (maquette v2). */
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
          placeholderTextColor={colors.textDisabled}
          secureTextEntry={secureToggle ? isHidden : inputProps.secureTextEntry}
          style={[
            styles.input,
            {
              // v2 : les inputs prennent le neutre du fond (#F7F6F2) — ils
              // vivent sur des cartes blanches, le contraste vient de là.
              backgroundColor: colors.background,
              borderColor: colors.border,
              color: colors.text,
            },
            secureToggle && styles.inputWithToggle,
            style,
          ]}
          {...inputProps}
        />
        {secureToggle ? (
          <Pressable
            onPress={() => setIsHidden((v) => !v)}
            hitSlop={10}
            style={styles.toggle}
            accessibilityRole="button"
            accessibilityLabel={isHidden ? "Afficher le mot de passe" : "Masquer le mot de passe"}
          >
            <Text style={[styles.toggleLabel, { color: colors.textMuted }]}>
              {isHidden ? "Afficher" : "Masquer"}
            </Text>
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
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: typeScale.body,
    fontFamily: fonts.medium,
    minHeight: 52,
  },
  hint: {
    fontSize: typeScale.caption,
    fontFamily: fonts.regular,
  },
  inputWithToggle: {
    paddingRight: 92,
  },
  toggle: {
    position: "absolute",
    right: 15,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  toggleLabel: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
