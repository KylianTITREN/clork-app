import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { fonts, radius, spacing, typeScale, useThemeColors } from "@/constants/tokens";

type NavRowProps = {
  /** Point de couleur 10 px (hub v2) — remplace la pastille icône si fourni. */
  dot?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconBg?: string;
  iconColor?: string;
  title: string;
  subtitle: string;
  onPress: () => void;
};

/** Rangée de navigation du profil : dot couleur (hub) ou pastille icône + titres + chevron. */
export function NavRow({ dot, icon, iconBg, iconColor, title, subtitle, onPress }: NavRowProps) {
  const colors = useThemeColors();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {dot ? (
        <View style={[styles.dot, { backgroundColor: dot }]} />
      ) : icon ? (
        <View style={[styles.icon, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
      ) : null}
      <View style={styles.textBox}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textDisabled} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: 15,
    paddingHorizontal: spacing.md,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  textBox: { flex: 1, gap: 1 },
  title: { fontSize: typeScale.body, fontFamily: fonts.bold },
  subtitle: { fontSize: typeScale.caption, fontFamily: fonts.medium },
});
