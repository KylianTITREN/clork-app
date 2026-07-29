import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  fonts,
  letterSpacing,
  radius,
  spacing,
  typeScale,
  useThemeColors,
} from "@/constants/tokens";

type SubPageHeaderProps = {
  title: string;
  /** Élément à droite (ex : pilule Enregistrer). */
  right?: React.ReactNode;
};

/**
 * En-tête des sous-pages du profil : bouton retour CARRÉ bordé + titre aligné
 * à gauche. Gabarit unique de la maquette v2 (carré 42 r12, titre 19/700) —
 * il revient sur 22 écrans, l'ancien 36/r11 + titre 26 était notre écart.
 */
export function SubPageHeader({ title, right }: SubPageHeaderProps) {
  const colors = useThemeColors();

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Retour"
        onPress={() => router.back()}
        hitSlop={8}
        style={({ pressed }) => [
          styles.back,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <Ionicons name="chevron-back" size={20} color={colors.text} />
      </Pressable>
      <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
        {title}
      </Text>
      {right ?? null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: spacing.sm,
  },
  back: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: typeScale.heading,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.heading,
  },
});
