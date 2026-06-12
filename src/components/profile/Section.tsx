import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import {
  fonts,
  radius,
  softShadow,
  spacing,
  typeScale,
  useThemeColors,
} from "@/constants/tokens";

type SectionProps = {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle?: string;
  /** Élément à droite de l'en-tête (ex : Switch). */
  right?: React.ReactNode;
  children?: React.ReactNode;
};

/** Carte blanche avec pastille d'icône colorée — bloc de réglages du profil. */
export function Section({ icon, iconBg, iconColor, title, subtitle, right, children }: SectionProps) {
  const colors = useThemeColors();
  return (
    <View style={[styles.section, { backgroundColor: colors.surface }, softShadow]}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIcon, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
        <View style={styles.sectionTitleBox}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>{subtitle}</Text>
          ) : null}
        </View>
        {right ?? null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.md },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sectionIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitleBox: { flex: 1, gap: 1 },
  sectionTitle: { fontSize: typeScale.body, fontFamily: fonts.extraBold },
  sectionSubtitle: { fontSize: typeScale.caption, fontFamily: fonts.semiBold },
});
