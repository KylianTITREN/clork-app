// Éditeur plein écran d'UN créneau type (maquette v2 « Nouveau créneau type »).
// Ouvert depuis Scan & horaires : { id } = édition, { new: "1" } = création.
// La liste vit désormais sur planning.tsx ; ici on charge la liste via
// preset-service, on modifie/ajoute/supprime l'entrée, puis router.back().

import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { router, useLocalSearchParams } from "expo-router";

import { SubPageHeader } from "@/components/profile/SubPageHeader";
import { Button } from "@/components/ui/Button";
import { ChoiceChips } from "@/components/ui/ChoiceChips";
import { TimePickerField } from "@/components/ui/TimePickerField";
import { TypeChipsRow, TypeSheet, type TypeChipOption } from "@/components/week/TypeSheet";
import {
  fonts,
  radius,
  shiftTypeLabel,
  spacing,
  typeScale,
  useThemeColors,
} from "@/constants/tokens";
import { listCustomTypes, type CustomShiftType } from "@/lib/custom-types-service";
import { isPremiumPlan, showPremiumGate, usePlan } from "@/lib/plan-service";
import {
  MAX_PRESETS,
  loadPresets,
  newPresetId,
  presetHasTimes,
  savePresets,
  type PresetType,
  type ShiftPreset,
} from "@/lib/preset-service";

// Types standard proposés en chips (même langage que l'éditeur de jour) ;
// les types persos de l'utilisateur suivent, puis la chip « + Autre… ».
const STANDARD_TYPE_OPTIONS: readonly PresetType[] = [
  "work",
  "off",
  "cp",
  "training",
  "meeting",
  "overtime",
];

/** Limite de créneaux types du plan gratuit (au-delà : Premium). */
export const FREE_PRESET_LIMIT = 3;

// Pauses proposées dans l'éditeur (maquette : Aucune / 1h / 30 min / Autre…).
const EDITOR_PAUSE_OPTIONS = [
  { minutes: 0, label: "Aucune" },
  { minutes: 60, label: "1h" },
  { minutes: 30, label: "30 min" },
] as const;

// Emoji (et séparateurs) en tête de nom — retirés à l'AFFICHAGE liste
// uniquement, la donnée garde le nom tel quel. Plages explicites plutôt que
// \p{Extended_Pictographic} (support Hermes).
const LEADING_EMOJI =
  /^(?:[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]|\s)+/u;

/** Nom d'affichage d'un créneau type dans les listes : emoji de tête retiré. */
export function presetDisplayName(label: string): string {
  const stripped = label.replace(LEADING_EMOJI, "").trim();
  return stripped.length > 0 ? stripped : label.trim();
}

const CUSTOM_PAUSE_SENTINEL = -1;
const MAX_CUSTOM_PAUSE_MINUTES = 600;

/** « 75 » → « 1h15 », « 45 » → « 45 min ». */
function formatPauseMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h${String(rest).padStart(2, "0")}` : `${hours}h`;
}

type PauseOption = { minutes: number; label: string };

type PauseDurationChipsProps = {
  /** Durée sélectionnée en minutes. */
  value: number;
  onChange: (minutes: number) => void;
  options: readonly PauseOption[];
};

/**
 * Chips de durée de pause — maquette v2 : sélection ENCRE (via ChoiceChips,
 * le vert reste réservé aux CTA), « Autre… » ouvre une saisie libre en
 * minutes. Une valeur custom apparaît comme chip encre sélectionnée.
 * Partagé entre Scan & horaires (planning.tsx) et cet éditeur.
 */
export function PauseDurationChips({ value, onChange, options }: PauseDurationChipsProps) {
  const colors = useThemeColors();
  const [isEditingCustom, setIsEditingCustom] = useState(false);
  const [customText, setCustomText] = useState("");

  const isCustomValue = value > 0 && !options.some((option) => option.minutes === value);

  const choices = [
    ...options.map((option) => ({ value: option.minutes, label: option.label })),
    ...(isCustomValue ? [{ value, label: formatPauseMinutes(value) }] : []),
    { value: CUSTOM_PAUSE_SENTINEL, label: "Autre…" },
  ];

  function handleSelect(next: number) {
    if (next === CUSTOM_PAUSE_SENTINEL) {
      setCustomText(isCustomValue ? String(value) : "");
      setIsEditingCustom(true);
      return;
    }
    setIsEditingCustom(false);
    onChange(next);
  }

  function commitCustom() {
    const minutes = Math.round(Number(customText));
    if (Number.isFinite(minutes) && minutes >= 0 && minutes <= MAX_CUSTOM_PAUSE_MINUTES) {
      onChange(minutes);
    }
    setIsEditingCustom(false);
  }

  return (
    <View style={pauseStyles.container}>
      <ChoiceChips options={choices} value={value} onChange={handleSelect} />
      {isEditingCustom ? (
        <View style={pauseStyles.editorRow}>
          <TextInput
            value={customText}
            onChangeText={setCustomText}
            keyboardType="number-pad"
            autoFocus
            placeholder="minutes"
            placeholderTextColor={colors.textDisabled}
            onSubmitEditing={commitCustom}
            style={[
              pauseStyles.input,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
          />
          <Text style={[pauseStyles.unit, { color: colors.textMuted }]}>min</Text>
          <Pressable
            onPress={commitCustom}
            accessibilityRole="button"
            style={[pauseStyles.okButton, { backgroundColor: colors.accent }]}
          >
            <Text style={[pauseStyles.okLabel, { color: colors.onAccent }]}>OK</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/** "HH:MM" → minutes depuis minuit. */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

/** Heures payées au format court français : 390 → « 6,5h », 420 → « 7h ». */
function formatPaidHours(minutes: number): string {
  const rounded = Math.round((minutes / 60) * 100) / 100;
  return `${String(rounded).replace(".", ",")}h`;
}

export default function PresetEditorScreen() {
  const colors = useThemeColors();
  const plan = usePlan();
  const params = useLocalSearchParams<{ id?: string; new?: string }>();
  const presetId = typeof params.id === "string" && params.id.length > 0 ? params.id : null;

  const [allPresets, setAllPresets] = useState<ShiftPreset[] | null>(null);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<PresetType>("work");
  // Type personnalisé sélectionné : null = type natif (même modèle que
  // l'éditeur de jour — un perso payé porte type "work", non payé "off").
  const [customTypeId, setCustomTypeId] = useState<string | null>(null);
  const [customTypes, setCustomTypes] = useState<CustomShiftType[]>([]);
  const [isTypeSheetOpen, setIsTypeSheetOpen] = useState(false);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadPresets().then((loaded) => {
      if (cancelled) return;
      setAllPresets(loaded);
      const existing = presetId ? loaded.find((preset) => preset.id === presetId) : undefined;
      if (existing) {
        setLabel(existing.label);
        setType(existing.type);
        setCustomTypeId(existing.customTypeId ?? null);
        setStart(existing.start);
        setEnd(existing.end);
        setBreakMinutes(existing.breakMinutes);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [presetId]);

  // Types personnalisés de l'utilisateur — chips après les types standards.
  // Best-effort : en cas d'échec réseau, les chips persos sont juste absentes.
  useEffect(() => {
    let cancelled = false;
    listCustomTypes()
      .then((types) => {
        if (!cancelled) setCustomTypes(types);
      })
      .catch(() => {
        // silencieux : l'éditeur reste utilisable avec les types natifs
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const existing = useMemo(
    () =>
      presetId && allPresets
        ? (allPresets.find((preset) => preset.id === presetId) ?? null)
        : null,
    [presetId, allPresets],
  );
  const isEditing = existing != null;

  // Type sans horaires (repos, CP, perso non payé) : cartes HORAIRES et
  // PAUSE masquées, aperçu sans heures payées.
  const isTimed = presetHasTimes({ type, customTypeId }, customTypes);
  const selectedCustomType = customTypeId
    ? (customTypes.find((candidate) => candidate.id === customTypeId) ?? null)
    : null;

  // Un type hors liste standard (preset stocké legacy) reste représentable :
  // sa chip est ajoutée dynamiquement, comme dans l'éditeur de jour.
  const nativeTypeOptions = useMemo(() => {
    const existingType = existing?.customTypeId == null ? existing?.type : undefined;
    return existingType && !STANDARD_TYPE_OPTIONS.includes(existingType)
      ? [...STANDARD_TYPE_OPTIONS, existingType]
      : STANDARD_TYPE_OPTIONS;
  }, [existing]);

  function selectNativeType(option: PresetType) {
    setCustomTypeId(null);
    setType(option);
  }

  function selectCustomType(customType: CustomShiftType) {
    setCustomTypeId(customType.id);
    setType(customType.isPaid ? "work" : "off");
  }

  function handleTypeCreated(created: CustomShiftType) {
    setCustomTypes((current) =>
      [...current, created].sort((a, b) => a.name.localeCompare(b.name, "fr")),
    );
    selectCustomType(created);
    setIsTypeSheetOpen(false);
  }

  // Chips : types standards puis persos (sélection encre), même langage que
  // l'éditeur de jour et le wizard manuel.
  const typeChipOptions: TypeChipOption[] = [
    ...nativeTypeOptions.map((option) => ({
      key: option,
      label: shiftTypeLabel[option],
      selected: customTypeId === null && option === type,
      onPress: () => selectNativeType(option),
    })),
    ...customTypes.map((customType) => ({
      key: `custom-${customType.id}`,
      label: customType.name,
      selected: customTypeId === customType.id,
      onPress: () => selectCustomType(customType),
    })),
  ];

  // Aperçu live : heures payées = amplitude − pause (plancher à 0).
  const paidMinutes = Math.max(0, timeToMinutes(end) - timeToMinutes(start) - breakMinutes);
  // Libellé de l'aperçu pour un type sans horaires : nom du perso ou du natif.
  const untimedTypeName = selectedCustomType?.name ?? shiftTypeLabel[type];

  async function handleSave() {
    if (!allPresets) return;
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      Alert.alert("Nom manquant", "Donne un nom à ce créneau type (ex. Matin marché).");
      return;
    }
    if (isTimed && end <= start) {
      Alert.alert("Horaires invalides", "La fin doit être après le début.");
      return;
    }
    if (!existing) {
      if (!isPremiumPlan(plan) && allPresets.length >= FREE_PRESET_LIMIT) {
        showPremiumGate("Plus de 3 créneaux types");
        return;
      }
      if (allPresets.length >= MAX_PRESETS) {
        Alert.alert("Limite atteinte", `Maximum ${MAX_PRESETS} créneaux types.`);
        return;
      }
    }
    setIsSaving(true);
    // L'emoji éventuel en tête du nom est préservé : on n'altère que les espaces.
    const next: ShiftPreset[] = existing
      ? allPresets.map((preset) =>
          preset.id === existing.id
            ? { ...preset, label: trimmedLabel, type, customTypeId, start, end, breakMinutes }
            : preset,
        )
      : [
          ...allPresets,
          { id: newPresetId(), label: trimmedLabel, type, customTypeId, start, end, breakMinutes },
        ];
    await savePresets(next);
    setIsSaving(false);
    router.back();
  }

  function confirmDelete() {
    if (!existing || !allPresets) return;
    const remaining = allPresets.filter((preset) => preset.id !== existing.id);
    Alert.alert(
      "Supprimer ce créneau type ?",
      `« ${presetDisplayName(existing.label)} » ne sera plus proposé à l'ajout d'un jour.`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: () => {
            void savePresets(remaining).then(() => router.back());
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
        >
          <View>
            <SubPageHeader
              title={isEditing ? "Modifier le créneau type" : "Nouveau créneau type"}
            />
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              Proposé en un tap à l'ajout d'un jour
            </Text>
          </View>

          <View style={styles.fieldBlock}>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Nom du créneau</Text>
            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder="Matin marché"
              placeholderTextColor={colors.textDisabled}
              maxLength={18}
              style={[
                styles.nameInput,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
            />
          </View>

          <View style={styles.fieldBlock}>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Type</Text>
            <TypeChipsRow options={typeChipOptions} onAddPress={() => setIsTypeSheetOpen(true)} />
          </View>

          {/* Types sans horaires (repos, CP, perso non payé) : pas de cartes
              HORAIRES/PAUSE, l'aperçu affiche « Nom · Type » sans heures. */}
          {isTimed ? (
            <>
              <View style={styles.fieldBlock}>
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Horaires</Text>
                <View style={styles.timesRow}>
                  <View style={styles.timeCol}>
                    <TimePickerField
                      value={start}
                      onChange={setStart}
                      label="Début"
                      variant="card"
                    />
                  </View>
                  <Ionicons name="arrow-forward" size={16} color={colors.textDisabled} />
                  <View style={styles.timeCol}>
                    <TimePickerField value={end} onChange={setEnd} label="Fin" variant="card" />
                  </View>
                </View>
              </View>

              <View style={styles.fieldBlock}>
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Pause</Text>
                <PauseDurationChips
                  value={breakMinutes}
                  onChange={setBreakMinutes}
                  options={EDITOR_PAUSE_OPTIONS}
                />
              </View>
            </>
          ) : null}

          <View style={styles.fieldBlock}>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Aperçu</Text>
            <View style={[styles.previewRow, { backgroundColor: colors.accentMuted }]}>
              <View style={[styles.previewPill, { backgroundColor: colors.surface }]}>
                <Text style={[styles.previewName, { color: colors.text }]} numberOfLines={1}>
                  {label.trim() || "Sans nom"} ·{" "}
                  {isTimed ? `${start}–${end}` : untimedTypeName}
                </Text>
              </View>
              {isTimed ? (
                <Text style={[styles.previewHours, { color: colors.accent }]}>
                  {formatPaidHours(paidMinutes)}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.actions}>
            <Button
              label={isEditing ? "Enregistrer ✓" : "Créer ce créneau type ✓"}
              onPress={() => void handleSave()}
              isLoading={isSaving}
              disabled={allPresets == null}
            />
            <Button label="Annuler" variant="ghost" onPress={() => router.back()} />
            {isEditing ? (
              <Pressable
                onPress={confirmDelete}
                accessibilityRole="button"
                style={({ pressed }) => [styles.deleteRow, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={[styles.deleteLabel, { color: colors.danger }]}>
                  Supprimer ce créneau type
                </Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Feuille « Nouveau type » : le type créé est sélectionné d'office */}
      {isTypeSheetOpen ? (
        <TypeSheet onClose={() => setIsTypeSheetOpen(false)} onCreated={handleTypeCreated} />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  // Sous-titre aligné sous le titre (retrait = bouton retour 36 + gap 12).
  subtitle: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
    paddingLeft: 48,
    marginTop: -2,
  },
  fieldBlock: { gap: spacing.sm - 2 },
  // Labels de champ v2 : tiny/semiBold, uppercase, letterSpacing 0.6.
  fieldLabel: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  // Input blanc bordé r11 (maquette « NOM DU CRÉNEAU »).
  nameInput: {
    borderWidth: 1,
    borderRadius: radius.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
    fontSize: typeScale.body,
    fontFamily: fonts.medium,
    minHeight: 52,
  },
  // Deux cartes blanches Début/Fin côte à côte, flèche entre les deux.
  timesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
  },
  timeCol: { flex: 1 },
  // Aperçu : fond accentMuted, pilule blanche + heures payées en accent.
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    borderRadius: radius.input,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm + 2,
  },
  previewPill: {
    flex: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: spacing.sm - 1,
  },
  previewName: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
  },
  previewHours: {
    fontSize: typeScale.body,
    fontFamily: fonts.bold,
    paddingRight: spacing.xs,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  deleteRow: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteLabel: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
  },
});

const pauseStyles = StyleSheet.create({
  container: { gap: spacing.sm },
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
