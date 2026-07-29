import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { pressOpacity } from "@/components/ui/press";
import { fonts, radius, spacing, typeScale, useThemeColors } from "@/constants/tokens";

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
  /** Ajoute un choix libre (saisie en minutes) en plus des propositions. */
  allowCustom?: boolean;
};

/**
 * Sélecteur de durée de pause en chips v2 — volontairement distinct du
 * sélecteur d'heure : actif = fond primaire texte blanc, inactif = carte
 * blanche bordée ; la durée custom s'affiche en pilule encre avec un crayon.
 */
export function DurationChips({ value, onChange, allowCustom = false }: DurationChipsProps) {
  const colors = useThemeColors();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");

  // Valeur sélectionnée qui ne correspond à aucune proposition.
  const isCustomValue =
    allowCustom && value > 0 && !PRESETS.some((preset) => preset.minutes === value);

  function openEditor() {
    setText(isCustomValue ? String(value) : "");
    setEditing(true);
  }

  function commit() {
    const minutes = Math.round(Number(text));
    if (Number.isFinite(minutes) && minutes >= 0 && minutes <= MAX_CUSTOM_MINUTES) {
      void Haptics.selectionAsync();
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
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => {
                // Choix d'un preset de durée : retour tactile discret.
                void Haptics.selectionAsync();
                onChange(minutes);
              }}
              style={({ pressed }) => [
                styles.chip,
                selected
                  ? { backgroundColor: colors.accent, borderColor: colors.accent }
                  : { backgroundColor: colors.surface, borderColor: colors.border },
                { opacity: pressed ? pressOpacity.control : 1 },
              ]}
            >
              <Text
                style={[
                  styles.label,
                  selected
                    ? [styles.labelSelected, { color: colors.onAccent }]
                    : { color: colors.textSoft },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}

        {isCustomValue ? (
          <Pressable
            onPress={openEditor}
            accessibilityRole="button"
            accessibilityState={{ selected: true }}
            style={({ pressed }) => [
              styles.chip,
              styles.customChip,
              {
                backgroundColor: colors.ink,
                borderColor: colors.ink,
                opacity: pressed ? pressOpacity.control : 1,
              },
            ]}
          >
            <Text style={[styles.label, styles.labelSelected, { color: colors.onInk }]}>
              {formatMinutes(value)}
            </Text>
            <Ionicons name="pencil" size={12} color={colors.onInk} />
          </Pressable>
        ) : null}

        {allowCustom ? (
          <Pressable
            onPress={openEditor}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: pressed ? pressOpacity.control : 1,
              },
            ]}
          >
            <Text style={[styles.label, { color: colors.textSoft }]}>Autre…</Text>
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
            placeholderTextColor={colors.textDisabled}
            onSubmitEditing={commit}
            style={[
              styles.input,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
          />
          <Text style={[styles.unit, { color: colors.textMuted }]}>min</Text>
          <Pressable
            onPress={commit}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.okButton,
              { backgroundColor: colors.accent, opacity: pressed ? pressOpacity.control : 1 },
            ]}
          >
            <Text style={[styles.okLabel, { color: colors.onAccent }]}>OK</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  chip: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 11,
    minHeight: 44,
    justifyContent: "center",
  },
  customChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  label: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
  },
  labelSelected: {
    fontFamily: fonts.semiBold,
  },
  editorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  input: {
    width: 96,
    borderRadius: radius.input,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: typeScale.body,
    fontFamily: fonts.medium,
  },
  unit: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
  },
  okButton: {
    borderRadius: 10,
    paddingHorizontal: 18,
    minHeight: 44,
    justifyContent: "center",
  },
  okLabel: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
  },
});
