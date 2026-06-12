import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import {
  radius,
  shiftTypeColor,
  shiftTypeLabel,
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
          backgroundColor: colors.surface,
          borderColor: draft.include ? typeColor : colors.border,
          opacity: draft.include ? 1 : 0.55,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={[styles.typeDot, { backgroundColor: typeColor }]} />
        <Text style={[styles.day, { color: colors.text }]}>{dayLabel}</Text>
        {draft.fromHandwriting ? <Text style={styles.handwriting}>✍️</Text> : null}
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: draft.include }}
          onPress={() => onChange({ ...draft, include: !draft.include })}
          style={[
            styles.includeToggle,
            {
              backgroundColor: draft.include ? typeColor : colors.surfaceMuted,
              borderColor: draft.include ? typeColor : colors.border,
            },
          ]}
        >
          <Text style={[styles.includeLabel, { color: draft.include ? "#FFF" : colors.textMuted }]}>
            {draft.include ? "Inclus" : "Ignoré"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.typeRow}>
        {EDITABLE_TYPES.map((type) => (
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
                backgroundColor:
                  draft.type === type ? shiftTypeColor[type] : colors.surfaceMuted,
              },
            ]}
          >
            <Text
              style={[
                styles.typeChipLabel,
                { color: draft.type === type ? "#FFF" : colors.textMuted },
              ]}
            >
              {shiftTypeLabel[type]}
            </Text>
          </Pressable>
        ))}
      </View>

      {showTimes ? (
        <View style={styles.timesRow}>
          <TextInput
            value={draft.start ?? ""}
            onChangeText={(start) => onChange({ ...draft, start })}
            placeholder="09:00"
            placeholderTextColor={colors.textMuted}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            style={[
              styles.timeInput,
              { backgroundColor: colors.surfaceMuted, color: colors.text },
            ]}
          />
          <Text style={[styles.timeSeparator, { color: colors.textMuted }]}>→</Text>
          <TextInput
            value={draft.end ?? ""}
            onChangeText={(end) => onChange({ ...draft, end })}
            placeholder="17:30"
            placeholderTextColor={colors.textMuted}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            style={[
              styles.timeInput,
              { backgroundColor: colors.surfaceMuted, color: colors.text },
            ]}
          />
        </View>
      ) : null}

      {showTimes && (pause > 0 || draft.durationHours != null) ? (
        <Text style={[styles.pause, { color: colors.textMuted }]}>
          {draft.durationHours != null ? `${draft.durationHours}h payées` : ""}
          {pause > 0
            ? ` · ${pause >= 60 ? `${Math.floor(pause / 60)}h${pause % 60 ? String(pause % 60).padStart(2, "0") : ""}` : `${pause} min`} de pause${draft.breakStart ? ` (${draft.breakStart} → ${addMinutesToTime(draft.breakStart, pause)})` : ""}`
            : ""}
        </Text>
      ) : null}

      {draft.highlighted ? (
        <View style={[styles.highlightBadge, { backgroundColor: colors.surfaceMuted }]}>
          <Text style={[styles.highlightLabel, { color: colors.text }]}>🖍️ Surligné sur le planning</Text>
        </View>
      ) : null}

      {draft.note ? (
        <Text style={[styles.note, { color: colors.textMuted }]} numberOfLines={2}>
          {draft.note}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1.5,
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
    fontWeight: "700",
    flex: 1,
    textTransform: "capitalize",
  },
  handwriting: {
    fontSize: typeScale.body,
  },
  includeToggle: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  includeLabel: {
    fontSize: typeScale.caption,
    fontWeight: "700",
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
    fontWeight: "600",
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
    fontWeight: "700",
    minWidth: 88,
    textAlign: "center",
  },
  timeSeparator: {
    fontSize: typeScale.body,
  },
  note: {
    fontSize: typeScale.caption,
  },
  pause: {
    fontSize: typeScale.caption,
    fontWeight: "600",
  },
  highlightBadge: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  highlightLabel: {
    fontSize: typeScale.caption,
    fontWeight: "600",
  },
});
