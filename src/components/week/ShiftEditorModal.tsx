import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Button } from "@/components/ui/Button";
import { ChoiceChips } from "@/components/ui/ChoiceChips";
import { DatePickerField } from "@/components/ui/DatePickerField";
import { DurationChips } from "@/components/ui/DurationChips";
import { TimePickerField } from "@/components/ui/TimePickerField";
import {
  fonts,
  letterSpacing,
  radius,
  shiftPeriodLabels,
  shiftTypeLabel,
  spacing,
  typeScale,
  useThemeColors,
  type ShiftPeriod,
  type ShiftType,
} from "@/constants/tokens";
import { addDays } from "@/lib/dates";
import { DEFAULT_PRESETS, loadPresets, type ShiftPreset } from "@/lib/preset-service";
import { breakMinutes, type DraftShift } from "@/lib/scan-service";
import { supabase } from "@/lib/supabase";
import type { Shift } from "@/lib/types";

const DAY_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

// Picker : rh et leave (legacy extraction) volontairement absents.
const TYPES: ShiftType[] = [
  "work",
  "training",
  "overtime",
  "meeting",
  "off",
  "cp",
  "rtt",
  "sick",
  "absent",
  "unpaid",
];
// Types horaires (début/fin obligatoires) vs absences (journée/demi-journée).
const TIMED_TYPES: ShiftType[] = ["work", "training", "overtime", "meeting"];
// Catégories proposées, dans l'ordre demandé.
const PERIOD_ORDER: ShiftPeriod[] = ["day", "morning", "afternoon", "evening", "opening", "closing"];
const HALF_DAY_TYPES: ShiftType[] = ["cp", "rtt", "sick", "absent", "unpaid"];
// Presets proposés sur les types « poste » (demande : travail ou formation).
const PRESET_TYPES: ShiftType[] = ["work", "training"];

// Garde-fou multi-jours : un ajout du 11 au 20 = 10 lignes, jamais plus de 31.
const MAX_RANGE_DAYS = 31;

type HalfDay = "day" | "morning" | "afternoon";
const HALF_DAY_OPTIONS: { id: HalfDay; label: string }[] = [
  { id: "day", label: "Journée" },
  { id: "morning", label: "Matin" },
  { id: "afternoon", label: "Après-midi" },
];

export type EditorTarget =
  | { mode: "edit"; shift: Shift }
  | { mode: "create"; date: string; userId: string; endDate?: string }
  // Édition d'un créneau de scan encore en mémoire (validation) : rien n'est
  // écrit en base, le résultat repart au parent via onDraftSave.
  | { mode: "draft"; draft: DraftShift; index: number };

type ShiftEditorModalProps = {
  target: EditorTarget | null;
  onClose: (didChange: boolean) => void;
  /** Requis pour le mode "draft" : renvoie le créneau édité au parent. */
  onDraftSave?: (index: number, next: DraftShift) => void;
};

/** Heures décimales entre deux "HH:MM" (fin > début supposé). */
function hoursBetween(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  return (eh * 60 + em - (sh * 60 + sm)) / 60;
}

function toLocalTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = from;
  while (cursor <= to && dates.length < MAX_RANGE_DAYS) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

export function ShiftEditorModal({ target, onClose, onDraftSave }: ShiftEditorModalProps) {
  const colors = useThemeColors();
  const [type, setType] = useState<ShiftType>("work");
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [pauseMinutes, setPauseMinutes] = useState(0);
  const [pauseStart, setPauseStart] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [period, setPeriod] = useState<ShiftPeriod | null>(null);
  const [halfDay, setHalfDay] = useState<HalfDay>("day");
  const [endDate, setEndDate] = useState<string | null>(null); // multi-jours
  const [presets, setPresets] = useState<ShiftPreset[]>(DEFAULT_PRESETS);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    // Rechargé à CHAQUE ouverture : le composant reste monté, sinon une modif
    // de preset (Profil → Créneaux types) ne serait jamais reflétée ici.
    loadPresets().then(setPresets);
    if (target.mode === "edit") {
      setType(target.shift.type);
      setStart(toLocalTime(target.shift.start_at));
      setEnd(toLocalTime(target.shift.end_at));
      setPauseMinutes(target.shift.break_minutes);
      setPauseStart(target.shift.break_start ? target.shift.break_start.slice(0, 5) : null);
      setNote(target.shift.note ?? "");
      setPeriod(target.shift.period ?? null);
      setHalfDay(
        target.shift.period === "morning" || target.shift.period === "afternoon"
          ? target.shift.period
          : "day",
      );
    } else if (target.mode === "draft") {
      const d = target.draft;
      setType(d.type);
      setStart(d.start);
      setEnd(d.end);
      setPauseMinutes(breakMinutes(d));
      setPauseStart(d.breakStart);
      setNote(d.note ?? "");
      setPeriod(d.period ?? null);
      setHalfDay(d.period === "morning" || d.period === "afternoon" ? d.period : "day");
    } else {
      setType("work");
      setStart(null);
      setEnd(null);
      setPauseMinutes(0);
      setPauseStart(null);
      setNote("");
      setPeriod(null);
      setHalfDay("day");
    }
    setEndDate(target.mode === "create" ? (target.endDate ?? null) : null);
    setSelectedPresetId(null);
    // Options avancées repliées par défaut, sauf si le créneau en utilise déjà.
    const usesAdvanced =
      target.mode === "edit"
        ? target.shift.period != null || !!target.shift.note
        : target.mode === "draft"
          ? target.draft.period != null || !!target.draft.note
          : false;
    setShowAdvanced(usesAdvanced);
  }, [target]);

  if (!target) return null;

  const isCreate = target.mode === "create";
  const isDraft = target.mode === "draft";
  const date =
    target.mode === "edit"
      ? target.shift.date
      : target.mode === "draft"
        ? target.draft.date
        : target.date;
  const needsTimes = TIMED_TYPES.includes(type);
  const isHalfDayType = HALF_DAY_TYPES.includes(type);
  const showPresets = (isCreate || isDraft) && PRESET_TYPES.includes(type) && presets.length > 0;

  function applyPreset(preset: ShiftPreset) {
    setType(preset.type);
    setStart(preset.start);
    setEnd(preset.end);
    setPauseMinutes(preset.breakMinutes);
    if (preset.period !== undefined) setPeriod(preset.period);
    setSelectedPresetId(preset.id);
  }

  async function handleSave() {
    if (!target) return;
    if (needsTimes) {
      if (!start || !end) {
        Alert.alert("Horaires manquants", "Choisis l'heure de début et de fin.");
        return;
      }
      if (end <= start) {
        Alert.alert("Horaire invalide", "La fin doit être après le début.");
        return;
      }
    }
    // Demi-journée stockée dans period (morning/afternoon), journée = null.
    const effectivePeriod: ShiftPeriod | null = isHalfDayType
      ? halfDay === "day"
        ? null
        : halfDay
      : period;

    // Mode "draft" (validation d'un scan) : on renvoie le créneau au parent,
    // aucune écriture en base. La pause (durée payée = amplitude − pause) ne
    // s'applique qu'aux créneaux horaires.
    if (target.mode === "draft") {
      const next: DraftShift = {
        ...target.draft,
        type,
        start: needsTimes ? start : null,
        end: needsTimes ? end : null,
        durationHours:
          needsTimes && start && end
            ? Math.max(0, hoursBetween(start, end) - pauseMinutes / 60)
            : null,
        breakStart: needsTimes && pauseMinutes > 0 ? pauseStart : null,
        period: effectivePeriod,
        note: note.trim() || null,
        include: true, // éditer un jour = vouloir le garder
      };
      onDraftSave?.(target.index, next);
      onClose(false);
      return;
    }

    setIsSaving(true);
    const basePayload = {
      start_at: null as string | null,
      end_at: null as string | null,
      type,
      break_minutes: needsTimes ? pauseMinutes : 0,
      break_start: needsTimes && pauseMinutes > 0 ? pauseStart : null,
      note: note.trim() || null,
      period: effectivePeriod,
      is_edited: true,
    };

    const targetDates =
      isCreate && endDate && endDate > date ? datesBetween(date, endDate) : [date];

    const rows = targetDates.map((day) => ({
      ...basePayload,
      date: day,
      start_at: needsTimes && start ? new Date(`${day}T${start}:00`).toISOString() : null,
      end_at: needsTimes && end ? new Date(`${day}T${end}:00`).toISOString() : null,
    }));

    const result =
      target.mode === "edit"
        ? await supabase.from("shifts").update(rows[0]).eq("id", target.shift.id)
        : await supabase
            .from("shifts")
            .insert(rows.map((row) => ({ ...row, user_id: target.userId, source: "manual" })));
    setIsSaving(false);
    if (result.error) {
      Alert.alert("Enregistrement impossible", result.error.message);
      return;
    }
    onClose(true);
  }

  async function handleDelete() {
    if (!target || target.mode !== "edit") return;
    Alert.alert("Supprimer ce créneau ?", "Cette action est définitive.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase.from("shifts").delete().eq("id", target.shift.id);
          if (error) {
            Alert.alert("Suppression impossible", error.message);
          } else {
            onClose(true);
          }
        },
      },
    ]);
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => onClose(false)}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.backdrop}
      >
        <Pressable style={styles.backdropTouch} onPress={() => onClose(false)} />
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={styles.grabber} />
          <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
            {/* En-tête : création, correction et édition clairement différenciées */}
            <View style={styles.headerRow}>
              <View style={styles.headerTextBox}>
                <Text style={[styles.title, { color: colors.text }]}>
                  {isCreate ? "Nouveau créneau" : isDraft ? "Corriger" : "Modifier le créneau"}
                </Text>
                <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                  {DAY_FORMATTER.format(new Date(`${date}T12:00:00`))}
                </Text>
              </View>
              <Pressable
                onPress={() => onClose(false)}
                hitSlop={10}
                style={[
                  styles.closeButton,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <Ionicons name="close" size={18} color={colors.text} />
              </Pressable>
            </View>

            {/* Presets en premier : un tap et tout est pré-rempli */}
            {showPresets ? (
              <View style={styles.presetBlock}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.presetRow}
                >
                  {presets.map((preset) => {
                    const selected = selectedPresetId === preset.id;
                    return (
                      <Pressable
                        key={preset.id}
                        onPress={() => applyPreset(preset)}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        style={[
                          styles.presetChip,
                          selected
                            ? { backgroundColor: colors.accentMuted, borderColor: colors.accent }
                            : { backgroundColor: colors.surface, borderColor: colors.border },
                        ]}
                      >
                        <Text style={[styles.presetLabel, { color: colors.text }]} numberOfLines={1}>
                          {preset.label}
                        </Text>
                        <Text style={[styles.presetHours, { color: colors.textMuted }]}>
                          {preset.start}–{preset.end}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <Text style={[styles.presetHint, { color: colors.textDisabled }]}>
                  tes créneaux types — un tap pour remplir
                </Text>
              </View>
            ) : null}

            {/* Type */}
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
              C'était quoi ce jour ?
            </Text>
            <ChoiceChips
              options={TYPES.map((t) => ({ value: t, label: shiftTypeLabel[t] }))}
              value={type}
              onChange={(t) => {
                setType(t);
                setSelectedPresetId(null);
              }}
            />

            {/* Horaires + pause */}
            {needsTimes ? (
              <>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Horaires</Text>
                <View style={styles.timesRow}>
                  <View style={styles.timeCol}>
                    <TimePickerField value={start} onChange={setStart} label="Début" variant="card" />
                  </View>
                  <Ionicons name="arrow-forward" size={16} color={colors.textDisabled} />
                  <View style={styles.timeCol}>
                    <TimePickerField value={end} onChange={setEnd} label="Fin" variant="card" />
                  </View>
                </View>

                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                  Durée de pause
                </Text>
                <DurationChips value={pauseMinutes} onChange={setPauseMinutes} allowCustom />
                {pauseMinutes > 0 ? (
                  <TimePickerField
                    value={pauseStart}
                    onChange={setPauseStart}
                    placeholder="12:30"
                    label="Débute à"
                    variant="row"
                  />
                ) : null}
              </>
            ) : null}

            {/* Journée ou demi-journée pour les absences */}
            {isHalfDayType ? (
              <>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Durée</Text>
                <ChoiceChips
                  options={HALF_DAY_OPTIONS.map((option) => ({
                    value: option.id,
                    label: option.label,
                  }))}
                  value={halfDay}
                  onChange={setHalfDay}
                />
              </>
            ) : null}

            {/* Options avancées repliées : garde l'écran aéré par défaut, mais
                TOUT reste accessible d'un tap (catégorie, plage, note). */}
            <Pressable onPress={() => setShowAdvanced((v) => !v)} style={styles.advancedToggle}>
              <Ionicons name="options-outline" size={15} color={colors.textMuted} />
              <Text style={[styles.advancedToggleLabel, { color: colors.textSoft }]}>
                {showAdvanced ? "Moins d'options" : "Plus d'options"}
              </Text>
              <Ionicons
                name={showAdvanced ? "chevron-up" : "chevron-down"}
                size={15}
                color={colors.textMuted}
              />
            </Pressable>

            {showAdvanced ? (
              <>
                {/* Multi-jours : congés du 11 au 20, 2 jours de formation… */}
                {isCreate ? (
                  <>
                    <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                      Jusqu'au (optionnel)
                    </Text>
                    <View style={styles.rangeRow}>
                      <DatePickerField
                        value={endDate}
                        onChange={setEndDate}
                        placeholder="Un seul jour"
                        minimumDate={addDays(date, 1)}
                      />
                      {endDate ? (
                        <Pressable onPress={() => setEndDate(null)} hitSlop={8}>
                          <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                        </Pressable>
                      ) : null}
                      {endDate && endDate > date ? (
                        <Text style={[styles.rangeCount, { color: colors.textMuted }]}>
                          {datesBetween(date, endDate).length} jours d'affilée
                        </Text>
                      ) : null}
                    </View>
                  </>
                ) : null}

                {/* Catégorie (optionnelle) pour les créneaux horaires */}
                {needsTimes ? (
                  <>
                    <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                      Catégorie (optionnel)
                    </Text>
                    <ChoiceChips
                      options={PERIOD_ORDER.map((id) => ({
                        value: id,
                        label: shiftPeriodLabels[id],
                      }))}
                      value={period}
                      onChange={(id) => setPeriod(period === id ? null : id)}
                    />
                  </>
                ) : null}

                {/* Note */}
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Note (optionnelle)"
                  placeholderTextColor={colors.textDisabled}
                  style={[
                    styles.noteInput,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                />
              </>
            ) : null}

            <View style={styles.actionsRow}>
              <View style={styles.saveButton}>
                <Button
                  label={isCreate ? "Ajouter au planning" : isDraft ? "Valider ce créneau" : "Enregistrer"}
                  onPress={handleSave}
                  isLoading={isSaving}
                />
              </View>
              {target.mode === "edit" ? (
                <Pressable
                  onPress={handleDelete}
                  accessibilityLabel="Supprimer le créneau"
                  style={[
                    styles.deleteButton,
                    { backgroundColor: colors.surface, borderColor: colors.dangerBorder },
                  ]}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                </Pressable>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  backdropTouch: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: "85%",
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(127,127,127,0.35)",
    marginTop: spacing.sm,
  },
  sheetContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  headerTextBox: {
    flex: 1,
    gap: 2,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: typeScale.heading,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.heading,
  },
  subtitle: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
    textTransform: "capitalize",
  },
  presetBlock: {
    gap: 6,
  },
  presetRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  presetChip: {
    minWidth: 104,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm + 4,
    alignItems: "center",
    gap: 2,
  },
  presetLabel: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
  },
  presetHours: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
  },
  presetHint: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.medium,
    textAlign: "center",
  },
  sectionLabel: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: -spacing.sm,
  },
  advancedToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs + 2,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  advancedToggleLabel: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
  },
  timesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
  },
  timeCol: {
    flex: 1,
  },
  rangeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  rangeCount: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
  },
  noteInput: {
    borderRadius: radius.input,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: typeScale.body,
    fontFamily: fonts.medium,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  saveButton: {
    flex: 1, // Enregistrer prend toute la largeur restante (~85 %)
  },
  deleteButton: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
