import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  fonts,
  radius,
  shiftTypeColor,
  shiftTypeLabel,
  shiftTypeSoftColor,
  spacing,
  typeScale,
  useThemeColors,
} from "@/constants/tokens";
import { addMinutesToTime } from "@/lib/dates";
import { breakMinutes, type DraftShift } from "@/lib/scan-service";

const DAY_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

const INK = "#26210E";
const INK_SOFT = "rgba(38,33,14,0.65)";

type DraftShiftCardProps = {
  draft: DraftShift;
  /** Ouvre l'éditeur unique (tous les filtres). */
  onEdit: () => void;
  /** Inclure / ignorer ce jour sans ouvrir l'éditeur. */
  onToggleInclude: () => void;
};

/**
 * Carte-résumé d'un jour proposé par le scan : lecture claire (jour, type,
 * horaires) + un tap pour éditer dans l'éditeur unique, + un interrupteur
 * inclure/ignorer. Toute l'édition fine se fait dans le même éditeur que
 * l'ajout manuel — mêmes filtres partout.
 */
export function DraftShiftCard({ draft, onEdit, onToggleInclude }: DraftShiftCardProps) {
  const colors = useThemeColors();
  const typeColor = shiftTypeColor[draft.type];
  const dayLabel = DAY_FORMATTER.format(new Date(`${draft.date}T12:00:00`));
  const showTimes = draft.type === "work" || draft.type === "meeting" || draft.type === "training";
  const pause = breakMinutes(draft);

  const summary =
    showTimes && draft.start && draft.end
      ? `${draft.start} – ${draft.end}`
      : shiftTypeLabel[draft.type];

  return (
    <Pressable
      onPress={onEdit}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: draft.include ? shiftTypeSoftColor[draft.type] : colors.surfaceMuted,
          opacity: draft.include ? (pressed ? 0.85 : 1) : 0.6,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={[styles.typeDot, { backgroundColor: typeColor }]} />
        <Text style={[styles.day, { color: INK }]} numberOfLines={1}>
          {dayLabel}
        </Text>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: draft.include }}
          onPress={onToggleInclude}
          hitSlop={6}
          style={[
            styles.includeToggle,
            { backgroundColor: draft.include ? INK : "rgba(255,255,255,0.7)" },
          ]}
        >
          <Text style={[styles.includeLabel, { color: draft.include ? "#FFF" : colors.textMuted }]}>
            {draft.include ? "Inclus" : "Ignoré"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.bodyRow}>
        <View style={styles.summaryBox}>
          <View style={[styles.typeChip, { backgroundColor: "rgba(255,255,255,0.7)" }]}>
            <Text style={[styles.typeChipLabel, { color: INK }]}>{shiftTypeLabel[draft.type]}</Text>
          </View>
          <Text style={[styles.summary, { color: INK }]}>{summary}</Text>
          {pause > 0 ? (
            <Text style={[styles.pause, { color: INK_SOFT }]}>
              · {pause} min de pause
              {draft.breakStart ? ` (${draft.breakStart} → ${addMinutesToTime(draft.breakStart, pause)})` : ""}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={INK_SOFT} />
      </View>

      {draft.fromHandwriting ? (
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>✍️ Corrigé à la main sur le planning</Text>
        </View>
      ) : null}
      {draft.highlighted ? (
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>🖍️ Surligné sur le planning</Text>
        </View>
      ) : null}
      {draft.note ? (
        <Text style={styles.note} numberOfLines={2}>
          {draft.note}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  typeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  day: {
    fontSize: typeScale.body,
    fontFamily: fonts.extraBold,
    flex: 1,
    textTransform: "capitalize",
  },
  includeToggle: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  includeLabel: {
    fontSize: typeScale.caption,
    fontFamily: fonts.extraBold,
  },
  bodyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  summaryBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  typeChip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  typeChipLabel: {
    fontSize: 11,
    fontFamily: fonts.bold,
  },
  summary: {
    fontSize: typeScale.body,
    fontFamily: fonts.black,
  },
  pause: {
    fontSize: typeScale.caption,
    fontFamily: fonts.bold,
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: "rgba(255,255,255,0.65)",
  },
  badgeLabel: {
    fontSize: typeScale.caption,
    fontFamily: fonts.bold,
    color: INK,
  },
  note: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
    color: INK_SOFT,
  },
});
