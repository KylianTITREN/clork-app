// Widgets v2 (maquette 4c · Apparence) : la page route reste accessible mais
// se réduit aux aperçus partagés <WidgetPreviews/> + la caption d'ajout —
// le contenu vit désormais aussi inline dans Apparence (theme.tsx).

import { ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SubPageHeader } from "@/components/profile/SubPageHeader";
import { WidgetPreviews } from "@/components/profile/WidgetPreviews";
import { fonts, spacing, typeScale, useThemeColors } from "@/constants/tokens";

/** Page d'info : les widgets iOS, aperçus aux couleurs du thème. */
export default function WidgetsScreen() {
  const colors = useThemeColors();

  return (
    <SafeAreaView edges={["top"]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <SubPageHeader title="Widgets" />
        <WidgetPreviews />
        <Text style={[styles.caption, { color: colors.textDisabled }]}>
          Appui long sur l'écran d'accueil → ＋ → Clork. Appui long sur le widget Jour pour
          basculer Aujourd'hui ⇄ Demain.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { padding: spacing.lg, gap: 12 },
  caption: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.medium,
    lineHeight: 16,
  },
});
