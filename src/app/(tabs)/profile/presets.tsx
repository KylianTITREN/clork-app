import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SavePill } from "@/components/profile/SavePill";
import { Section } from "@/components/profile/Section";
import { SubPageHeader } from "@/components/profile/SubPageHeader";
import { ChoiceChips } from "@/components/ui/ChoiceChips";
import { DurationChips } from "@/components/ui/DurationChips";
import { TimePickerField } from "@/components/ui/TimePickerField";
import {
  fonts,
  radius,
  shiftPeriodLabels,
  shiftTypeLabel,
  spacing,
  typeScale,
  useThemeColors,
  type ShiftPeriod,
} from "@/constants/tokens";
import { isPremiumPlan, showPremiumGate, usePlan } from "@/lib/plan-service";
import {
  DEFAULT_PRESETS,
  MAX_PRESETS,
  loadPresets,
  newPresetId,
  savePresets,
  type PresetType,
  type ShiftPreset,
} from "@/lib/preset-service";

const PRESET_TYPE_OPTIONS: PresetType[] = ["work", "training", "overtime"];
const PRESET_PERIOD_OPTIONS: ShiftPeriod[] = ["day", "morning", "afternoon", "evening", "opening", "closing"];

// Options au format ChoiceChips (langage v2 : actif = fond primaire).
const TYPE_CHOICES = PRESET_TYPE_OPTIONS.map((option) => ({
  value: option,
  label: shiftTypeLabel[option],
}));
const PERIOD_CHOICES = PRESET_PERIOD_OPTIONS.map((option) => ({
  value: option,
  label: shiftPeriodLabels[option],
}));

/**
 * Créneaux types personnalisables : chaque boîte a ses horaires (ex. 7h–13h
 * le matin). Proposés en un tap à l'ajout d'un créneau Travail/Formation.
 */
export default function PresetsScreen() {
  const colors = useThemeColors();
  const plan = usePlan();
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
    if (!isPremiumPlan(plan) && presets.length >= 3) {
      showPremiumGate("Plus de 3 créneaux types");
      return;
    }
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
        "Créneau type incomplet",
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
          title="Tes créneaux types"
          subtitle="Proposés en un tap à l'ajout manuel"
        >
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Adapte-les aux horaires de ta boîte (ex. Matin 7h–13h). Le type, les
            horaires et la pause se pré-remplissent quand tu choisis un créneau type.
          </Text>
        </Section>

        {presets.map((preset) => (
          <View
            key={preset.id}
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={styles.cardHeader}>
              <TextInput
                value={preset.label}
                onChangeText={(label) => patch(preset.id, { label })}
                placeholder="Matin"
                placeholderTextColor={colors.textDisabled}
                maxLength={18}
                style={[
                  styles.labelInput,
                  {
                    color: colors.text,
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
              />
              <Pressable
                onPress={() => removePreset(preset.id)}
                hitSlop={8}
                accessibilityLabel="Supprimer ce créneau type"
                style={[styles.deleteButton, { backgroundColor: colors.background }]}
              >
                <Ionicons name="trash-outline" size={17} color={colors.danger} />
              </Pressable>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Type</Text>
              <ChoiceChips
                options={TYPE_CHOICES}
                value={preset.type}
                onChange={(type) => patch(preset.id, { type })}
              />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Horaires</Text>
              <View style={styles.timesRow}>
                <TimePickerField
                  value={preset.start}
                  onChange={(start) => patch(preset.id, { start })}
                />
                <Ionicons name="arrow-forward" size={14} color={colors.textMuted} />
                <TimePickerField value={preset.end} onChange={(end) => patch(preset.id, { end })} />
              </View>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Pause</Text>
              <DurationChips
                value={preset.breakMinutes}
                onChange={(breakMinutes) => patch(preset.id, { breakMinutes })}
                allowCustom
              />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
                Catégorie (optionnel)
              </Text>
              <ChoiceChips
                options={PERIOD_CHOICES}
                value={preset.period ?? null}
                onChange={(period) =>
                  patch(preset.id, { period: (preset.period ?? null) === period ? null : period })
                }
              />
            </View>
          </View>
        ))}

        {presets.length < MAX_PRESETS ? (
          <Pressable
            onPress={addPreset}
            style={({ pressed }) => [
              styles.addRow,
              { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Ionicons name="add" size={16} color={colors.text} />
            <Text style={[styles.addLabel, { color: colors.text }]}>Ajouter un créneau type</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { padding: spacing.lg, gap: 12 },
  hint: {
    fontSize: typeScale.caption,
    fontFamily: fonts.regular,
    lineHeight: 17,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  // Input v2 : fond neutre, rayon 11, texte medium.
  labelInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.input,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: spacing.sm + 2,
    fontSize: typeScale.body,
    fontFamily: fonts.medium,
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldBlock: { gap: spacing.sm - 2 },
  // Labels de champ v2 : tiny/semiBold, uppercase, letterSpacing 0.6.
  fieldLabel: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  timesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: radius.input,
    paddingVertical: spacing.sm + 4,
  },
  addLabel: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
  },
});
