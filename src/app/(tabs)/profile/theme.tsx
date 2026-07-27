import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SubPageHeader } from "@/components/profile/SubPageHeader";
import { WidgetPreviews } from "@/components/profile/WidgetPreviews";
import { appIconByTheme } from "@/constants/logo-assets";
import { DEFAULT_THEME_ID, themeLabels, themeOrder, themes, type ThemeId } from "@/constants/themes";
import { fonts, radius, spacing, typeScale, useThemeColors } from "@/constants/tokens";
import { isPremiumPlan, showPremiumGate, usePlan } from "@/lib/plan-service";
import { getIconFollowsTheme, setIconFollowsTheme, useTheme } from "@/providers/theme-provider";

/**
 * Apparence v2 (maquette 4c) : pastilles de thème à application IMMÉDIATE
 * (plus de pilule Enregistrer), toggle « l'icône suit le thème », et la carte
 * Widgets inline avec ses aperçus.
 */
export default function ThemeSettingsScreen() {
  const colors = useThemeColors();
  const { themeId, setThemeId } = useTheme();
  const plan = usePlan();
  const isPremium = isPremiumPlan(plan);

  // Toggle « L'icône de l'app suit le thème » — hydraté depuis AsyncStorage.
  const [isIconFollowing, setIsIconFollowing] = useState(true);
  useEffect(() => {
    let isMounted = true;
    getIconFollowsTheme().then((enabled) => {
      if (isMounted) setIsIconFollowing(enabled);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <SafeAreaView edges={["top"]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <SubPageHeader title="Apparence" />

        {/* Carte Thème */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Thème</Text>
            <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
              La couleur d'accent de toute l'app
            </Text>
          </View>

          {!isPremium ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => showPremiumGate("Le changement de thème")}
              style={[styles.lockBanner, { backgroundColor: colors.background }]}
            >
              <Text style={[styles.lockBannerText, { color: colors.textMuted }]}>
                Les thèmes sont réservés à Premium
              </Text>
              <Text style={[styles.lockBannerCta, { color: colors.accent }]}>Débloquer ›</Text>
            </Pressable>
          ) : null}

          <View style={styles.swatchRow}>
            {themeOrder.map((idRaw) => {
              const id = idRaw as ThemeId;
              const isSelected = id === themeId;
              // Gating v2 : seuls le thème par défaut et le thème actif sont
              // libres — le reste de la collection est Premium.
              const isLocked = !isPremium && !isSelected && id !== DEFAULT_THEME_ID;
              return (
                <Pressable
                  key={id}
                  onPress={() =>
                    isLocked ? showPremiumGate("Le changement de thème") : setThemeId(id)
                  }
                  accessibilityRole="radio"
                  accessibilityLabel={`Thème ${themeLabels[id]}`}
                  accessibilityState={{ selected: isSelected, disabled: isLocked }}
                  style={styles.swatchItem}
                >
                  <View
                    style={[
                      styles.swatchRing,
                      { borderColor: isSelected ? colors.text : "transparent" },
                    ]}
                  >
                    <View
                      style={[
                        styles.swatch,
                        { backgroundColor: themes[id].accent, opacity: isLocked ? 0.4 : 1 },
                      ]}
                    >
                      {isSelected ? (
                        <Ionicons name="checkmark" size={18} color={themes[id].onAccent} />
                      ) : null}
                    </View>
                    {isLocked ? (
                      <View
                        style={[
                          styles.lockBadge,
                          { backgroundColor: colors.surface, borderColor: colors.border },
                        ]}
                      >
                        <Ionicons name="lock-closed" size={10} color={colors.textMuted} />
                      </View>
                    ) : null}
                  </View>
                  <Text
                    style={[
                      styles.swatchLabel,
                      {
                        color: isSelected ? colors.text : colors.textMuted,
                        fontFamily: isSelected ? fonts.semiBold : fonts.medium,
                        opacity: isLocked ? 0.4 : 1,
                      },
                    ]}
                  >
                    {themeLabels[id]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Toggle « L'icône de l'app suit le thème » */}
          <View style={[styles.iconRow, { backgroundColor: colors.background }]}>
            <Image source={appIconByTheme[themeId]} style={styles.iconRowImage} />
            <Text style={[styles.iconRowLabel, { color: colors.text }]}>
              L'icône de l'app suit le thème
            </Text>
            <Switch
              value={isIconFollowing}
              onValueChange={(enabled) => {
                setIsIconFollowing(enabled);
                setIconFollowsTheme(enabled);
              }}
              trackColor={{ false: colors.surfaceMuted, true: colors.accent }}
              ios_backgroundColor={colors.surfaceMuted}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Carte Widgets — v2 : les widgets vivent dans Apparence. */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Widgets</Text>
            <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
              Ton planning sur l'écran d'accueil
            </Text>
          </View>
          <WidgetPreviews />
          <Text style={[styles.caption, { color: colors.textDisabled }]}>
            Appui long sur l'écran d'accueil → ＋ → Clork. Appui long sur le widget Jour pour
            basculer Aujourd'hui ⇄ Demain.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md - 4 },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md + 2,
    gap: 12,
  },
  cardTitle: {
    fontSize: typeScale.body,
    fontFamily: fonts.bold,
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
    marginTop: 2,
  },
  lockBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: 10,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm + 1,
  },
  lockBannerText: {
    flex: 1,
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
  },
  lockBannerCta: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.bold,
  },
  swatchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  swatchItem: {
    alignItems: "center",
    gap: 5,
  },
  // Anneau de sélection : bordure encre 2px, décollée de la pastille.
  swatchRing: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  lockBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  swatchLabel: {
    fontSize: typeScale.tiny - 1,
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: radius.input,
    paddingHorizontal: spacing.sm + 5,
    paddingVertical: spacing.sm + 2,
  },
  iconRowImage: {
    width: 28,
    height: 28,
    // Arrondi « squircle » iOS (~25 % de la taille).
    borderRadius: 7,
  },
  iconRowLabel: {
    flex: 1,
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
  },
  caption: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.medium,
    lineHeight: 16,
  },
});
