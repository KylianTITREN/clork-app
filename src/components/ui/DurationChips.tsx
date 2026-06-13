import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { fonts, radius, spacing, useThemeColors } from "@/constants/tokens";

const PRESETS: { minutes: number; label: string }[] = [
  { minutes: 0, label: "Aucune" },
  { minutes: 30, label: "30 min" },
  { minutes: 45, label: "45 min" },
  { minutes: 60, label: "1h" },
  { minutes: 90, label: "1h30" },
  { minutes: 120, label: "2h" },
];

const MAX_CUSTOM_MINUTES = 600;

/** "75" → "1h15", "45" → "45 min". */
function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h${String(rest).padStart(2, "0")}` : `${hours}h`;
}

type DurationChipsProps = {
  /** Durée sélectionnée en minutes. */
  value: number;
  onChange: (minutes: number) => void;
  /** Rendu sur carte pastel (fonds translucides, encre). */
  compact?: boolean;
  /** Ajoute un choix libre (saisie en minutes) en plus des propositions. */
  allowCustom?: boolean;
};

/** Sélecteur de durée de pause en chips — fini la saisie au clavier. */
export function DurationChips({
  value,
  onChange,
  compact = false,
  allowCustom = false,
}: DurationChipsProps) {
  const colors = useThemeColors();
  const ink = "#26210E";
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");

  // Valeur sélectionnée qui ne correspond à aucune proposition.
  const isCustomValue =
    allowCustom && value > 0 && !PRESETS.some((preset) => preset.minutes === value);

  const chipBg = (selected: boolean) =>
    selected
      ? compact
        ? ink
        : colors.text
      : compact
        ? "rgba(255,255,255,0.65)"
        : colors.surfaceMuted;
  const chipColor = (selected: boolean) =>
    selected
      ? compact
        ? "#FFF"
        : colors.background
      : compact
        ? "rgba(38,33,14,0.65)"
        : colors.textMuted;

  function openEditor() {
    setText(isCustomValue ? String(value) : "");
    setEditing(true);
  }

  function commit() {
    const minutes = Math.round(Number(text));
    if (Number.isFinite(minutes) && minutes >= 0 && minutes <= MAX_CUSTOM_MINUTES) {
      onChange(minutes);
    }
    setEditing(false);
  }

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {PRESETS.map(({ minutes, label }) => {
          const selected = value === minutes;
          return (
            <Pressable
              key={minutes}
              onPress={() => onChange(minutes)}
              style={[styles.chip, { backgroundColor: chipBg(selected) }]}
            >
              <Text style={[styles.label, { color: chipColor(selected) }]}>{label}</Text>
            </Pressable>
          );
        })}

        {isCustomValue ? (
          <Pressable
            onPress={openEditor}
            style={[styles.chip, { backgroundColor: chipBg(true) }]}
          >
            <Text style={[styles.label, { color: chipColor(true) }]}>
              {formatMinutes(value)}
            </Text>
          </Pressable>
        ) : null}

        {allowCustom ? (
          <Pressable
            onPress={openEditor}
            style={[styles.chip, { backgroundColor: chipBg(false) }]}
          >
            <Text style={[styles.label, { color: chipColor(false) }]}>Autre…</Text>
          </Pressable>
        ) : null}
      </View>

      {editing ? (
        <View style={styles.editorRow}>
          <TextInput
            value={text}
            onChangeText={setText}
            keyboardType="number-pad"
            autoFocus
            placeholder="minutes"
            placeholderTextColor={compact ? "rgba(38,33,14,0.4)" : colors.textMuted}
            onSubmitEditing={commit}
            style={[
              styles.input,
              {
                backgroundColor: compact ? "rgba(255,255,255,0.85)" : colors.surfaceMuted,
                color: compact ? ink : colors.text,
              },
            ]}
          />
          <Text style={[styles.unit, { color: compact ? "rgba(38,33,14,0.65)" : colors.textMuted }]}>
            min
          </Text>
          <Pressable onPress={commit} style={[styles.okButton, { backgroundColor: compact ? ink : colors.text }]}>
            <Text style={[styles.okLabel, { color: compact ? "#FFF" : colors.background }]}>OK</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  chip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 1,
  },
  label: {
    fontSize: 12,
    fontFamily: fonts.bold,
  },
  editorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  input: {
    width: 88,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    fontSize: 14,
    fontFamily: fonts.bold,
  },
  unit: {
    fontSize: 12,
    fontFamily: fonts.bold,
  },
  okButton: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  okLabel: {
    fontSize: 12,
    fontFamily: fonts.extraBold,
  },
});
