import { Ionicons } from "@expo/vector-icons";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Section } from "@/components/profile/Section";
import { SubPageHeader } from "@/components/profile/SubPageHeader";
import { appIconByTheme } from "@/constants/logo-assets";
import { themeLabels, themeOrder, themes, type ThemeId } from "@/constants/themes";
import { fonts, radius, spacing, useThemeColors } from "@/constants/tokens";
import { useTheme } from "@/providers/theme-provider";

export default function ThemeSettingsScreen() {
  const colors = useThemeColors();
  const { themeId, setThemeId } = useTheme();

  return (
    <SafeAreaView edges={["top"]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <SubPageHeader title="Thème" />

        <Section
          icon="color-palette"
          iconBg={colors.accentMuted}
          iconColor={colors.accent}
          title="Thème"
          subtitle="Couleur de l'app et de son icône"
        >
          <View style={styles.themeGrid}>
            {themeOrder.map((id) => {
              const isSelected = id === themeId;
              return (
                <Pressable key={id} onPress={() => setThemeId(id as ThemeId)} style={styles.themeItem}>
                  {/* L'icône d'app réelle : ce que l'écran d'accueil affichera. */}
                  <View style={[styles.themeSwatchRing, { borderColor: isSelected ? colors.text : "transparent" }]}>
                    <Image source={appIconByTheme[id as ThemeId]} style={styles.themeIcon} />
                    {isSelected ? (
                      <View style={[styles.themeCheck, { backgroundColor: colors.text }]}>
                        <Ionicons name="checkmark" size={12} color={themes[id as ThemeId].accent} />
                      </View>
                    ) : null}
                  </View>
                  <Text
                    style={[
                      styles.themeLabel,
                      {
                        color: isSelected ? colors.text : colors.textMuted,
                        fontFamily: isSelected ? fonts.extraBold : fonts.semiBold,
                      },
                    ]}
                  >
                    {themeLabels[id as ThemeId]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  themeGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  themeItem: { alignItems: "center", gap: spacing.xs, width: 72 },
  themeSwatchRing: { borderWidth: 2, borderRadius: 17, padding: 3 },
  // Arrondi « squircle » iOS (~22 % de la taille).
  themeIcon: { width: 52, height: 52, borderRadius: 12 },
  themeCheck: {
    position: "absolute",
    right: -2,
    top: -2,
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  themeLabel: { fontSize: 11 },
});
