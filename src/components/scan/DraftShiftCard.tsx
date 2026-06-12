import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import {
  fonts,
  inkOnAccent,
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
import { breakMinutes, type DraftShift } from "@/lib/scan-service";

const DAY_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

const EDITABLE_TYPES: ShiftType[] = ["work", "off", "rh", "cp", "meeting"];
// Texte des chips sélectionnées : encre sur les couleurs claires, blanc sinon.
const INK_CHIP_TYPES: ShiftType[] = ["work", "cp", "leave"];

const INK_SOFT = "rgba(38,33,14,0.65)";

type DraftShiftCardProps = {
  draft: DraftShift;
  onChange: (next: DraftShift) => void;
};

export function DraftShiftCard({ draft, onChange }: DraftShiftCardProps) {
  const colors = useThemeColors();
  const typeColor = shiftTypeColor[draft.type];
  const dayLabel = DAY_FORMATTER.format(new Date(`${draft.date}T12:00:00`));
  const showTimes = draft.type === "work" || draft.type === "meeting";
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
        <Text style={[styles.day, { color: inkOnAccent }]}>{dayLabel}</Text>
        {draft.fromHandwriting ? <Text style={styles.handwriting}>✍️</Text> : null}
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: draft.include }}
          onPress={() => onChange({ ...draft, include: !draft.include })}
          style={[
            styles.includeToggle,
            { backgroundColor: draft.include ? inkOnAccent : "rgba(255,255,255,0.7)" },
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
                  // Un type sans horaires vide les heures ; work/meeting les exige.
                  start: type === "work" || type === "meeting" ? draft.start : null,
                  end: type === "work" || type === "meeting" ? draft.end : null,
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
                        ? inkOnAccent
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
          <TextInput
            value={draft.start ?? ""}
            onChangeText={(start) => onChange({ ...draft, start })}
            placeholder="09:00"
            placeholderTextColor={INK_SOFT}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            style={styles.timeInput}
          />
          <Text style={[styles.timeSeparator, { color: INK_SOFT }]}>→</Text>
          <TextInput
            value={draft.end ?? ""}
            onChangeText={(end) => onChange({ ...draft, end })}
            placeholder="17:30"
            placeholderTextColor={INK_SOFT}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            style={styles.timeInput}
          />
        </View>
      ) : null}

      {showTimes && (pause > 0 || draft.durationHours != null) ? (
        <View style={styles.pauseRow}>
          <View style={styles.pauseLine} />
          <Text style={styles.pauseText}>
            {draft.durationHours != null ? `${draft.durationHours}h payées` : ""}
            {pause > 0
              ? `${draft.durationHours != null ? " · " : ""}${pause >= 60 ? `${Math.floor(pause / 60)}h${pause % 60 ? String(pause % 60).padStart(2, "0") : ""}` : `${pause} min`} de pause${draft.breakStart ? ` (${draft.breakStart} → ${addMinutesToTime(draft.breakStart, pause)})` : ""}`
              : ""}
          </Text>
          <View style={styles.pauseLine} />
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
  timeInput: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typeScale.body,
    fontFamily: fonts.extraBold,
    minWidth: 88,
    textAlign: "center",
    backgroundColor: "rgba(255,255,255,0.7)",
    color: inkOnAccent,
  },
  timeSeparator: {
    fontSize: typeScale.body,
  },
  pauseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  pauseLine: {
    flex: 1,
    borderBottomWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(38,33,14,0.25)",
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
    color: inkOnAccent,
  },
  note: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
    color: INK_SOFT,
  },
});
