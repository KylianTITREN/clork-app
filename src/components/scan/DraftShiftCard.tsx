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
  type ShiftType,
} from "@/constants/tokens";
import { addMinutesToTime } from "@/lib/dates";
import { DurationChips } from "@/components/ui/DurationChips";
import { TimePickerField } from "@/components/ui/TimePickerField";
import { breakMinutes, spanHours, type DraftShift } from "@/lib/scan-service";

const DAY_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

const EDITABLE_TYPES: ShiftType[] = ["work", "training", "off", "rh", "cp", "meeting"];
// Texte des chips sélectionnées : encre sur les couleurs claires, blanc sinon.
const INK_CHIP_TYPES: ShiftType[] = ["work", "cp", "leave"];

const INK = "#26210E";
const INK_SOFT = "rgba(38,33,14,0.65)";

type DraftShiftCardProps = {
  draft: DraftShift;
  onChange: (next: DraftShift) => void;
};

export function DraftShiftCard({ draft, onChange }: DraftShiftCardProps) {
  const colors = useThemeColors();
  const typeColor = shiftTypeColor[draft.type];
  const dayLabel = DAY_FORMATTER.format(new Date(`${draft.date}T12:00:00`));
  const showTimes = draft.type === "work" || draft.type === "meeting" || draft.type === "training";
  const pause = breakMinutes(draft);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: draft.include
            ? shiftTypeSoftColor[draft.type]
            : colors.surfaceMuted,
          opacity: draft.include ? 1 : 0.6,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={[styles.typeDot, { backgroundColor: typeColor }]} />
        <Text style={[styles.day, { color: INK }]}>{dayLabel}</Text>

        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: draft.include }}
          onPress={() => onChange({ ...draft, include: !draft.include })}
          style={[
            styles.includeToggle,
            { backgroundColor: draft.include ? INK : "rgba(255,255,255,0.7)" },
          ]}
        >
          <Text
            style={[
              styles.includeLabel,
              { color: draft.include ? "#FFF" : colors.textMuted },
            ]}
          >
            {draft.include ? "Inclus" : "Ignoré"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.typeRow}>
        {EDITABLE_TYPES.map((type) => {
          const selected = draft.type === type;
          return (
            <Pressable
              key={type}
              onPress={() =>
                onChange({
                  ...draft,
                  type,
                  // Choisir un type = vouloir garder ce jour : on le ré-inclut
                  // (les jours repos/illisibles arrivent « Ignoré » par défaut).
                  include: true,
                  // Un type sans horaires vide les heures ; work/meeting les exige.
                  start: type === "work" || type === "meeting" || type === "training" ? draft.start : null,
                  end: type === "work" || type === "meeting" || type === "training" ? draft.end : null,
                })
              }
              style={[
                styles.typeChip,
                {
                  backgroundColor: selected
                    ? shiftTypeColor[type]
                    : "rgba(255,255,255,0.65)",
                },
              ]}
            >
              <Text
                style={[
                  styles.typeChipLabel,
                  {
                    color: selected
                      ? INK_CHIP_TYPES.includes(type)
                        ? INK
                        : "#FFF"
                      : INK_SOFT,
                  },
                ]}
              >
                {shiftTypeLabel[type]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {showTimes ? (
        <View style={styles.timesRow}>
          <TimePickerField
            compact
            value={draft.start}
            onChange={(start) => onChange({ ...draft, start })}
            placeholder="Début"
          />
          <Text style={[styles.timeSeparator, { color: INK_SOFT }]}>→</Text>
          <TimePickerField
            compact
            value={draft.end}
            onChange={(end) => onChange({ ...draft, end })}
            placeholder="Fin"
          />
        </View>
      ) : null}

      {draft.type === "work" && draft.start && draft.end ? (
        <View style={styles.pauseBlock}>
          <View style={styles.pauseHeaderRow}>
            <Text style={styles.pauseLabel}>Pause</Text>
            {pause > 0 && draft.breakStart ? (
              <Text style={styles.pauseText}>
                {draft.breakStart} → {addMinutesToTime(draft.breakStart, pause)}
              </Text>
            ) : null}
            {draft.durationHours != null ? (
              <Text style={styles.pauseText}>
                {draft.durationHours.toLocaleString("fr-FR")}h payées
              </Text>
            ) : null}
          </View>
          <DurationChips
            compact
            allowCustom
            value={pause}
            onChange={(minutes) => {
              const span = spanHours(draft);
              if (span == null) return;
              onChange({
                ...draft,
                durationHours: Math.max(0, span - minutes / 60),
                breakStart: minutes > 0 ? draft.breakStart : null,
              });
            }}
          />
          {pause > 0 ? (
            <View style={styles.pauseStartRow}>
              <Text style={styles.pauseText}>à</Text>
              <TimePickerField
                compact
                value={draft.breakStart}
                onChange={(breakStart) => onChange({ ...draft, breakStart })}
                placeholder="12:30"
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {draft.fromHandwriting ? (
        <View style={styles.highlightBadge}>
          <Text style={styles.highlightLabel}>✍️ Corrigé à la main sur le planning</Text>
        </View>
      ) : null}

      {draft.highlighted ? (
        <View style={styles.highlightBadge}>
          <Text style={styles.highlightLabel}>🖍️ Surligné sur le planning</Text>
        </View>
      ) : null}

      {draft.note ? (
        <Text style={styles.note} numberOfLines={2}>
          {draft.note}
        </Text>
      ) : null}
    </View>
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
  handwriting: {
    fontSize: typeScale.body,
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
  typeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  typeChip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  typeChipLabel: {
    fontSize: typeScale.caption,
    fontFamily: fonts.bold,
  },
  timesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  timeSeparator: {
    fontSize: typeScale.body,
  },
  pauseBlock: {
    gap: spacing.xs,
    borderTopWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(38,33,14,0.2)",
    paddingTop: spacing.sm,
  },
  pauseHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  pauseLabel: {
    fontSize: 11,
    fontFamily: fonts.extraBold,
    color: "rgba(38,33,14,0.65)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    flex: 1,
  },
  pauseStartRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  pauseText: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: INK_SOFT,
  },
  highlightBadge: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: "rgba(255,255,255,0.65)",
  },
  highlightLabel: {
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
