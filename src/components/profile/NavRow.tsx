import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  fonts,
  radius,
  softShadow,
  spacing,
  typeScale,
  useThemeColors,
} from "@/constants/tokens";

type NavRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  onPress: () => void;
};

/** Rangée de navigation du hub profil : pastille colorée + titres + chevron. */
export function NavRow({ icon, iconBg, iconColor, title, subtitle, onPress }: NavRowProps) {
  const colors = useThemeColors();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 },
        softShadow,
      ]}
    >
      <View style={[styles.icon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View style={styles.textBox}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  textBox: { flex: 1, gap: 1 },
  title: { fontSize: typeScale.body, fontFamily: fonts.extraBold },
  subtitle: { fontSize: typeScale.caption, fontFamily: fonts.semiBold },
});
