import { Ionicons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Section } from "@/components/profile/Section";
import { SubPageHeader } from "@/components/profile/SubPageHeader";
import { fonts, radius, softShadow, spacing, typeScale, useThemeColors } from "@/constants/tokens";

const STEPS = [
  "Reste appuyé sur un espace vide de l'écran d'accueil.",
  "Touche « Modifier » puis « Ajouter un widget ».",
  "Cherche « Clork » et choisis Demain ou Ma semaine.",
];

/** Page d'info : les widgets iOS, comment les ajouter, ce qu'ils affichent. */
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

        {/* Aperçu façon widget « Demain » */}
        <View style={[styles.preview, { backgroundColor: colors.accent }, softShadow]}>
          <Text style={[styles.previewKicker, { color: colors.onAccent, opacity: 0.75 }]}>
            DEMAIN
          </Text>
          <Text style={[styles.previewHours, { color: colors.onAccent }]}>9:00 – 17:00</Text>
          <View style={styles.previewMetaRow}>
            <Ionicons name="cafe" size={13} color={colors.onAccent} />
            <Text style={[styles.previewMeta, { color: colors.onAccent, opacity: 0.85 }]}>
              Pause 1h · 7h payées
            </Text>
          </View>
        </View>

        <Section
          icon="grid"
          iconBg={colors.accentMuted}
          iconColor={colors.accent}
          title="Deux widgets disponibles"
          subtitle="Ils suivent la couleur de ton thème"
        >
          <View style={styles.widgetRow}>
            <View style={[styles.widgetBadge, { backgroundColor: colors.accentMuted }]}>
              <Ionicons name="sunny" size={16} color={colors.text} />
            </View>
            <View style={styles.widgetTextBox}>
              <Text style={[styles.widgetName, { color: colors.text }]}>Demain</Text>
              <Text style={[styles.widgetDesc, { color: colors.textMuted }]}>
                Tes horaires de demain en un coup d'œil (petit format).
              </Text>
            </View>
          </View>
          <View style={styles.widgetRow}>
            <View style={[styles.widgetBadge, { backgroundColor: colors.accentMuted }]}>
              <Ionicons name="calendar" size={16} color={colors.text} />
            </View>
            <View style={styles.widgetTextBox}>
              <Text style={[styles.widgetName, { color: colors.text }]}>Ma semaine</Text>
              <Text style={[styles.widgetDesc, { color: colors.textMuted }]}>
                Les 7 jours avec horaires, repos et congés (format moyen).
              </Text>
            </View>
          </View>
        </Section>

        <Section
          icon="add-circle"
          iconBg={colors.shiftCpSoft}
          iconColor={colors.shiftCp}
          title="Comment les ajouter"
        >
          {STEPS.map((step, index) => (
            <View key={step} style={styles.stepRow}>
              <View style={[styles.stepNumber, { backgroundColor: colors.text }]}>
                <Text style={[styles.stepNumberText, { color: colors.background }]}>
                  {index + 1}
                </Text>
              </View>
              <Text style={[styles.stepText, { color: colors.text }]}>{step}</Text>
            </View>
          ))}
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Les widgets se mettent à jour à chaque ouverture de l'app — après un
            scan ou un changement de thème, ouvre le Planning une fois.
          </Text>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  preview: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 2,
  },
  previewKicker: {
    fontSize: typeScale.caption,
    fontFamily: fonts.extraBold,
    letterSpacing: 1,
  },
  previewHours: {
    fontSize: typeScale.title,
    fontFamily: fonts.black,
  },
  previewMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  previewMeta: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
  },
  widgetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  widgetBadge: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  widgetTextBox: { flex: 1, gap: 1 },
  widgetName: {
    fontSize: typeScale.body,
    fontFamily: fonts.extraBold,
  },
  widgetDesc: {
    fontSize: typeScale.caption,
    fontFamily: fonts.regular,
    lineHeight: 17,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumberText: {
    fontSize: 12,
    fontFamily: fonts.extraBold,
  },
  stepText: {
    flex: 1,
    fontSize: typeScale.body,
    fontFamily: fonts.semiBold,
    lineHeight: 20,
  },
  hint: {
    fontSize: typeScale.caption,
    fontFamily: fonts.regular,
    lineHeight: 17,
  },
});
