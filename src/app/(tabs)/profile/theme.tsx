import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Section } from "@/components/profile/Section";
import { SubPageHeader } from "@/components/profile/SubPageHeader";
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
                  <View style={[styles.themeSwatchRing, { borderColor: isSelected ? colors.text : "transparent" }]}>
                    <View style={[styles.themeSwatch, { backgroundColor: themes[id as ThemeId].accent }]}>
                      {isSelected ? (
                        <Ionicons name="checkmark" size={16} color={themes[id as ThemeId].onAccent} />
                      ) : null}
                    </View>
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
  themeSwatchRing: { borderWidth: 2, borderRadius: radius.pill, padding: 3 },
  themeSwatch: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  themeLabel: { fontSize: 11 },
});
