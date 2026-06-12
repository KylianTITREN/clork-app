import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SavePill } from "@/components/profile/SavePill";
import { Section } from "@/components/profile/Section";
import { SubPageHeader } from "@/components/profile/SubPageHeader";
import { DurationChips } from "@/components/ui/DurationChips";
import { TimePickerField } from "@/components/ui/TimePickerField";
import {
  fonts,
  radius,
  shiftTypeLabel,
  spacing,
  typeScale,
  useThemeColors,
} from "@/constants/tokens";
import {
  DEFAULT_PRESETS,
  MAX_PRESETS,
  loadPresets,
  newPresetId,
  savePresets,
  type PresetType,
  type ShiftPreset,
} from "@/lib/preset-service";

const PRESET_TYPE_OPTIONS: PresetType[] = ["work", "training", "opening", "closing", "overtime"];

/**
 * Créneaux types personnalisables : chaque boîte a ses horaires (ex. 7h–13h
 * le matin). Proposés en un tap à l'ajout d'un créneau Travail/Formation.
 */
export default function PresetsScreen() {
  const colors = useThemeColors();
  const [presets, setPresets] = useState<ShiftPreset[]>(DEFAULT_PRESETS);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadPresets().then(setPresets);
  }, []);

  function patch(id: string, changes: Partial<ShiftPreset>) {
    setPresets((current) =>
      current.map((preset) => (preset.id === id ? { ...preset, ...changes } : preset)),
    );
    setIsDirty(true);
  }

  function removePreset(id: string) {
    setPresets((current) => current.filter((preset) => preset.id !== id));
    setIsDirty(true);
  }

  function addPreset() {
    setPresets((current) => [
      ...current,
      {
        id: newPresetId(),
        label: "Nouveau",
        type: "work",
        start: "09:00",
        end: "17:00",
        breakMinutes: 0,
      },
    ]);
    setIsDirty(true);
  }

  async function handleSave() {
    const invalid = presets.find((preset) => !preset.label.trim() || preset.end <= preset.start);
    if (invalid) {
      Alert.alert(
        "Preset incomplet",
        `« ${invalid.label || "Sans nom"} » : il faut un nom et une fin après le début.`,
      );
      return;
    }
    setIsSaving(true);
    await savePresets(presets);
    setIsSaving(false);
    setIsDirty(false);
  }

  return (
    <SafeAreaView edges={["top"]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <SubPageHeader
          title="Créneaux types"
          right={<SavePill isDirty={isDirty} isSaving={isSaving} onPress={handleSave} />}
        />

        <Section
          icon="flash"
          iconBg={colors.accentMuted}
          iconColor={colors.accent}
          title="Tes presets"
          subtitle="Proposés en un tap à l'ajout d'un créneau"
        >
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Adapte-les aux horaires de ta boîte (ex. Matin 7h–13h). Le type, les
            horaires et la pause se pré-remplissent quand tu choisis un preset.
          </Text>
        </Section>

        {presets.map((preset) => (
          <View key={preset.id} style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.cardHeader}>
              <TextInput
                value={preset.label}
                onChangeText={(label) => patch(preset.id, { label })}
                placeholder="🌅 Matin"
                placeholderTextColor={colors.textMuted}
                maxLength={18}
                style={[styles.labelInput, { color: colors.text, backgroundColor: colors.background }]}
              />
              <Pressable
                onPress={() => removePreset(preset.id)}
                hitSlop={8}
                accessibilityLabel="Supprimer ce preset"
                style={[styles.deleteButton, { backgroundColor: colors.background }]}
              >
                <Ionicons name="trash-outline" size={17} color="#D64545" />
              </Pressable>
            </View>

            <View style={styles.typeRow}>
              {PRESET_TYPE_OPTIONS.map((option) => {
                const selected = preset.type === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => patch(preset.id, { type: option })}
                    style={[
                      styles.typeChip,
                      { backgroundColor: selected ? colors.text : colors.background },
                    ]}
                  >
                    <Text
                      style={[
                        styles.typeLabel,
                        { color: selected ? colors.background : colors.textMuted },
                      ]}
                    >
                      {shiftTypeLabel[option]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.timesRow}>
              <TimePickerField
                value={preset.start}
                onChange={(start) => patch(preset.id, { start })}
              />
              <Ionicons name="arrow-forward" size={14} color={colors.textMuted} />
              <TimePickerField value={preset.end} onChange={(end) => patch(preset.id, { end })} />
            </View>

            <Text style={[styles.pauseLabel, { color: colors.textMuted }]}>Pause</Text>
            <DurationChips
              value={preset.breakMinutes}
              onChange={(breakMinutes) => patch(preset.id, { breakMinutes })}
            />
          </View>
        ))}

        {presets.length < MAX_PRESETS ? (
          <Pressable
            onPress={addPreset}
            style={[styles.addRow, { borderColor: colors.border }]}
          >
            <Ionicons name="add" size={18} color={colors.text} />
            <Text style={[styles.addLabel, { color: colors.text }]}>Ajouter un preset</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  hint: {
    fontSize: typeScale.caption,
    fontFamily: fonts.regular,
    lineHeight: 17,
  },
  card: {
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  labelInput: {
    flex: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    fontSize: typeScale.body,
    fontFamily: fonts.extraBold,
  },
  deleteButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  typeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  typeChip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
  },
  typeLabel: {
    fontSize: typeScale.caption,
    fontFamily: fonts.bold,
  },
  timesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  pauseLabel: {
    fontSize: typeScale.caption,
    fontFamily: fonts.bold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: -spacing.xs,
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
  },
  addLabel: {
    fontSize: typeScale.body,
    fontFamily: fonts.extraBold,
  },
});
