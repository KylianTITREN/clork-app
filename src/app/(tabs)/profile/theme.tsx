import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Section } from "@/components/profile/Section";
import { SubPageHeader } from "@/components/profile/SubPageHeader";
import { SavePill } from "@/components/profile/SavePill";
import { appIconByTheme } from "@/constants/logo-assets";
import { themeLabels, themeOrder, themes, type ThemeId } from "@/constants/themes";
import { fonts, radius, softShadow, spacing, typeScale, useThemeColors } from "@/constants/tokens";
import { isPremiumPlan, showPremiumGate, usePlan } from "@/lib/plan-service";
import { useTheme } from "@/providers/theme-provider";

/**
 * Choix du thème : la sélection est locale et ne prend effet (couleurs +
 * icône d'app) qu'à l'enregistrement — pas de changement surprise en scrollant.
 */
export default function ThemeSettingsScreen() {
  const colors = useThemeColors();
  const { themeId, setThemeId } = useTheme();
  const plan = usePlan();
  const [selected, setSelected] = useState<ThemeId>(themeId);

  const isDirty = selected !== themeId;

  return (
    <SafeAreaView edges={["top"]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <SubPageHeader
          title="Thème"
          right={
            <SavePill
              isDirty={isDirty}
              isSaving={false}
              onPress={() => {
                if (!isPremiumPlan(plan) && selected !== "honey") {
                  showPremiumGate("Le changement de thème");
                  return;
                }
                setThemeId(selected);
              }}
            />
          }
        />

        <Section
          icon="color-palette"
          iconBg={colors.accentMuted}
          iconColor={colors.accent}
          title="Couleur de l'app"
          subtitle="L'icône sur l'écran d'accueil suit le thème"
        >
          <View style={styles.list}>
            {themeOrder.map((idRaw) => {
              const id = idRaw as ThemeId;
              const isSelected = id === selected;
              return (
                <Pressable
                  key={id}
                  onPress={() => setSelected(id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  style={[
                    styles.row,
                    {
                      backgroundColor: colors.background,
                      borderColor: isSelected ? colors.text : colors.border,
                    },
                    isSelected && softShadow,
                  ]}
                >
                  <Image source={appIconByTheme[id]} style={styles.rowIcon} />
                  <Text
                    style={[
                      styles.rowLabel,
                      {
                        color: isSelected ? colors.text : colors.textMuted,
                        fontFamily: isSelected ? fonts.extraBold : fonts.semiBold,
                      },
                    ]}
                  >
                    {themeLabels[id]}
                  </Text>
                  <View style={[styles.rowSwatch, { backgroundColor: themes[id].accent }]} />
                  <Ionicons
                    name={isSelected ? "radio-button-on" : "radio-button-off"}
                    size={20}
                    color={isSelected ? colors.text : colors.border}
                  />
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Touche « Enregistrer » pour appliquer la couleur et changer l'icône de l'app.
          </Text>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  list: { gap: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  // Arrondi « squircle » iOS (~22 % de la taille).
  rowIcon: { width: 40, height: 40, borderRadius: 9 },
  rowLabel: { flex: 1, fontSize: typeScale.body },
  rowSwatch: { width: 22, height: 22, borderRadius: radius.pill },
  hint: {
    fontSize: typeScale.caption,
    fontFamily: fonts.regular,
    lineHeight: 17,
  },
});
