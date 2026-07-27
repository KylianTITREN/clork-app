// Aperçus widgets v2 (maquette 4c · Apparence) : « Demain » (badge primaire,
// barre verticale primaire, horaire en bold) et « Ma semaine » (pilule totale
// primaire, 7 barres hauteur ∝ heures, pastille encre du jour actif) — sur
// fond neutre bordé, comme les vrais widgets. Réutilisé par Apparence et la
// page Widgets.

import { StyleSheet, Text, View } from "react-native";

import { fonts, radius, spacing, typeScale, useThemeColors } from "@/constants/tokens";

// Semaine d'exemple de la maquette : L 7h30 (jour actif), M 6h, M 7h30,
// J repos, V 7h30, S/D repos — total 28h30.
const WEEK_PREVIEW = [
  { id: "mon", letter: "L", hours: "7h30", barHeight: 38, isActive: true },
  { id: "tue", letter: "M", hours: "6h", barHeight: 30, isActive: false },
  { id: "wed", letter: "M", hours: "7h30", barHeight: 38, isActive: false },
  { id: "thu", letter: "J", hours: null, barHeight: 4, isActive: false },
  { id: "fri", letter: "V", hours: "7h30", barHeight: 38, isActive: false },
  { id: "sat", letter: "S", hours: null, barHeight: 4, isActive: false },
  { id: "sun", letter: "D", hours: null, barHeight: 4, isActive: false },
] as const;

/** Aperçus fidèles des deux widgets iOS — aux couleurs du thème actif. */
export function WidgetPreviews() {
  const colors = useThemeColors();

  return (
    <View style={styles.container}>
      {/* Aperçu « Demain » (petit) */}
      <View
        style={[styles.preview, { backgroundColor: colors.background, borderColor: colors.border }]}
      >
        <View style={styles.previewHeader}>
          <View style={[styles.previewBadge, { backgroundColor: colors.accent }]}>
            <Text style={[styles.previewBadgeLabel, { color: colors.onAccent }]}>DEMAIN</Text>
          </View>
          <Text style={[styles.previewDate, { color: colors.textMuted }]}>28/07</Text>
        </View>
        <View style={styles.previewBody}>
          <View style={[styles.previewBar, { backgroundColor: colors.accent }]} />
          <View style={styles.previewLines}>
            <Text style={[styles.previewType, { color: colors.textMuted }]}>Travail</Text>
            <Text style={[styles.previewHours, { color: colors.text }]}>09:00 – 16:00</Text>
            <Text style={[styles.previewMeta, { color: colors.textMuted }]}>Pause 1h</Text>
          </View>
        </View>
      </View>

      {/* Aperçu « Ma semaine » (moyen) */}
      <View
        style={[styles.preview, { backgroundColor: colors.background, borderColor: colors.border }]}
      >
        <View style={styles.weekHeader}>
          <Text style={[styles.weekKicker, { color: colors.textMuted }]}>MA SEMAINE</Text>
          <View style={[styles.weekTotalPill, { backgroundColor: colors.accent }]}>
            <Text style={[styles.weekTotalLabel, { color: colors.onAccent }]}>28h30</Text>
          </View>
        </View>
        <View style={styles.weekBars}>
          {WEEK_PREVIEW.map((day) => (
            <View key={day.id} style={styles.weekDay}>
              <Text
                style={[styles.weekHours, { color: day.hours ? colors.text : colors.textMuted }]}
              >
                {day.hours ?? "—"}
              </Text>
              <View
                style={[
                  styles.weekBar,
                  {
                    height: day.barHeight,
                    backgroundColor: day.hours ? colors.accent : colors.border,
                  },
                ]}
              />
              {day.isActive ? (
                <View style={[styles.weekDot, { backgroundColor: colors.ink }]}>
                  <Text style={[styles.weekDotLabel, { color: colors.onInk }]}>{day.letter}</Text>
                </View>
              ) : (
                <Text style={[styles.weekLetter, { color: colors.textMuted }]}>{day.letter}</Text>
              )}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  // Cartes d'aperçu : fond app neutre + bordure, comme les widgets réels.
  preview: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md - 2,
    gap: spacing.sm + 1,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  previewBadge: {
    borderRadius: 7,
    paddingHorizontal: spacing.sm + 1,
    paddingVertical: 2,
  },
  previewBadgeLabel: {
    fontSize: 9.5,
    fontFamily: fonts.bold,
    letterSpacing: 0.8,
  },
  previewDate: { fontSize: typeScale.tiny, fontFamily: fonts.medium },
  previewBody: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm + 1,
  },
  previewBar: {
    width: 4,
    borderRadius: 2,
  },
  previewLines: { gap: 1 },
  previewType: { fontSize: 10, fontFamily: fonts.semiBold },
  previewHours: {
    fontSize: 18,
    fontFamily: fonts.bold,
    letterSpacing: -0.4,
  },
  previewMeta: { fontSize: 10, fontFamily: fonts.medium },
  weekHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  weekKicker: {
    fontSize: 10,
    fontFamily: fonts.bold,
    letterSpacing: 1,
  },
  weekTotalPill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 2,
  },
  weekTotalLabel: { fontSize: typeScale.tiny, fontFamily: fonts.bold },
  weekBars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 7,
  },
  weekDay: {
    flex: 1,
    alignItems: "center",
    gap: spacing.xs,
  },
  weekHours: { fontSize: 9.5, fontFamily: fonts.semiBold },
  weekBar: {
    alignSelf: "stretch",
    borderRadius: 4,
  },
  weekDot: {
    width: 17,
    height: 17,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  weekDotLabel: { fontSize: 9, fontFamily: fonts.bold },
  weekLetter: { fontSize: 9.5, fontFamily: fonts.semiBold },
});
