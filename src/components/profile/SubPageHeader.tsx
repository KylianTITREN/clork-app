import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  fonts,
  radius,
  softShadow,
  spacing,
  typeScale,
  useThemeColors,
} from "@/constants/tokens";

type SubPageHeaderProps = {
  title: string;
  /** Élément à droite (ex : pilule Enregistrer). */
  right?: React.ReactNode;
};

/** En-tête des sous-pages du profil : chevron retour + titre + action. */
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
          { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
          softShadow,
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
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { flex: 1, fontSize: typeScale.heading, fontFamily: fonts.black },
});
