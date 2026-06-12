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
import { DatePickerField } from "@/components/ui/DatePickerField";
import { DurationChips } from "@/components/ui/DurationChips";
import { TimePickerField } from "@/components/ui/TimePickerField";
import {
  fonts,
  radius,
  shiftPeriodLabels,
  shiftTypeColor,
  shiftTypeLabel,
  spacing,
  typeScale,
  useThemeColors,
  type ShiftPeriod,
  type ShiftType,
} from "@/constants/tokens";
import { addDays } from "@/lib/dates";
import { DEFAULT_PRESETS, loadPresets, type ShiftPreset } from "@/lib/preset-service";
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
  "opening",
  "closing",
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
// Chips sélectionnées : encre sur couleurs claires, blanc sur foncées.
const INK_CHIP_TYPES: ShiftType[] = ["work", "cp", "leave", "opening", "absent"];

// Types horaires (début/fin obligatoires) vs absences (journée/demi-journée).
const TIMED_TYPES: ShiftType[] = ["work", "opening", "closing", "training", "overtime", "meeting"];
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
  | { mode: "create"; date: string; userId: string };

type ShiftEditorModalProps = {
  target: EditorTarget | null;
  onClose: (didChange: boolean) => void;
};

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

export function ShiftEditorModal({ target, onClose }: ShiftEditorModalProps) {
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
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadPresets().then(setPresets);
  }, []);

  useEffect(() => {
    if (!target) return;
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
    setEndDate(null);
    setSelectedPresetId(null);
  }, [target]);

  if (!target) return null;

  const isCreate = target.mode === "create";
  const date = target.mode === "edit" ? target.shift.date : target.date;
  const needsTimes = TIMED_TYPES.includes(type);
  const isHalfDayType = HALF_DAY_TYPES.includes(type);
  const showPresets = isCreate && PRESET_TYPES.includes(type) && presets.length > 0;

  function applyPreset(preset: ShiftPreset) {
    setType(preset.type);
    setStart(preset.start);
    setEnd(preset.end);
    setPauseMinutes(preset.breakMinutes);
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
    setIsSaving(true);
    // Demi-journée stockée dans period (morning/afternoon), journée = null.
    const effectivePeriod: ShiftPeriod | null = isHalfDayType
      ? halfDay === "day"
        ? null
        : halfDay
      : period;
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
            {/* En-tête : création et édition clairement différenciées */}
            <View style={styles.headerRow}>
              <View style={[styles.headerIcon, { backgroundColor: colors.accentMuted }]}>
                <Ionicons
                  name={isCreate ? "add" : "pencil"}
                  size={20}
                  color={colors.text}
                />
              </View>
              <View style={styles.headerTextBox}>
                <Text style={[styles.title, { color: colors.text }]}>
                  {isCreate ? "Nouveau créneau" : "Modifier le créneau"}
                </Text>
                <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                  {DAY_FORMATTER.format(new Date(`${date}T12:00:00`))}
                </Text>
              </View>
              <Pressable
                onPress={() => onClose(false)}
                hitSlop={10}
                style={[styles.closeButton, { backgroundColor: colors.surfaceMuted }]}
              >
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </Pressable>
            </View>

            {/* Type */}
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Type</Text>
            <View style={styles.typeRow}>
              {TYPES.map((t) => {
                const selected = type === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() => {
                      setType(t);
                      setSelectedPresetId(null);
                    }}
                    style={[
                      styles.typeChip,
                      { backgroundColor: selected ? shiftTypeColor[t] : colors.surface },
                    ]}
                  >
                    <Text
                      style={[
                        styles.typeLabel,
                        {
                          color: selected
                            ? INK_CHIP_TYPES.includes(t)
                              ? "#26210E"
                              : "#FFF"
                            : colors.textMuted,
                        },
                      ]}
                    >
                      {shiftTypeLabel[t]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Presets personnalisables (Profil → Créneaux types) */}
            {showPresets ? (
              <View style={styles.presetRow}>
                {presets.map((preset) => {
                  const selected = selectedPresetId === preset.id;
                  return (
                    <Pressable
                      key={preset.id}
                      onPress={() => applyPreset(preset)}
                      style={[
                        styles.presetChip,
                        { backgroundColor: selected ? colors.accent : colors.surface },
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
              </View>
            ) : null}

            {/* Horaires + pause */}
            {needsTimes ? (
              <>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Horaires</Text>
                <View style={styles.timesRow}>
                  <TimePickerField value={start} onChange={setStart} placeholder="Début" />
                  <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
                  <TimePickerField value={end} onChange={setEnd} placeholder="Fin" />
                </View>

                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Pause</Text>
                <DurationChips value={pauseMinutes} onChange={setPauseMinutes} />
                {pauseMinutes > 0 ? (
                  <View style={styles.pauseStartRow}>
                    <Text style={[styles.pauseAt, { color: colors.textMuted }]}>à</Text>
                    <TimePickerField
                      value={pauseStart}
                      onChange={setPauseStart}
                      placeholder="12:30"
                    />
                  </View>
                ) : null}
              </>
            ) : null}

            {/* Journée ou demi-journée pour les absences */}
            {isHalfDayType ? (
              <>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Durée</Text>
                <View style={styles.typeRow}>
                  {HALF_DAY_OPTIONS.map((option) => {
                    const selected = halfDay === option.id;
                    return (
                      <Pressable
                        key={option.id}
                        onPress={() => setHalfDay(option.id)}
                        style={[
                          styles.typeChip,
                          { backgroundColor: selected ? colors.text : colors.surface },
                        ]}
                      >
                        <Text
                          style={[
                            styles.typeLabel,
                            { color: selected ? colors.background : colors.textMuted },
                          ]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

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
                <View style={styles.typeRow}>
                  {(Object.keys(shiftPeriodLabels) as ShiftPeriod[]).map((id) => {
                    const selected = period === id;
                    return (
                      <Pressable
                        key={id}
                        onPress={() => setPeriod(selected ? null : id)}
                        style={[
                          styles.typeChip,
                          { backgroundColor: selected ? colors.text : colors.surface },
                        ]}
                      >
                        <Text
                          style={[
                            styles.typeLabel,
                            { color: selected ? colors.background : colors.textMuted },
                          ]}
                        >
                          {shiftPeriodLabels[id]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            {/* Note */}
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Note (optionnelle)"
              placeholderTextColor={colors.textMuted}
              style={[
                styles.noteInput,
                { backgroundColor: colors.surface, color: colors.text },
              ]}
            />

            <View style={styles.actionsRow}>
              <View style={styles.saveButton}>
                <Button
                  label={isCreate ? "Ajouter au planning" : "Enregistrer"}
                  variant="dark"
                  onPress={handleSave}
                  isLoading={isSaving}
                />
              </View>
              {!isCreate ? (
                <Pressable
                  onPress={handleDelete}
                  accessibilityLabel="Supprimer le créneau"
                  style={[styles.deleteButton, { backgroundColor: colors.surface }]}
                >
                  <Ionicons name="trash-outline" size={20} color="#D64545" />
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
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextBox: {
    flex: 1,
    gap: 1,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: typeScale.heading,
    fontFamily: fonts.black,
  },
  subtitle: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
    textTransform: "capitalize",
  },
  presetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  presetChip: {
    flexBasis: "30%",
    flexGrow: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xs,
    alignItems: "center",
    gap: 1,
  },
  presetLabel: {
    fontSize: typeScale.caption,
    fontFamily: fonts.extraBold,
  },
  presetHours: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
  },
  sectionLabel: {
    fontSize: typeScale.caption,
    fontFamily: fonts.bold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: -spacing.xs,
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
  rangeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  rangeCount: {
    fontSize: typeScale.caption,
    fontFamily: fonts.bold,
  },
  pauseStartRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  pauseAt: {
    fontSize: typeScale.body,
    fontFamily: fonts.semiBold,
  },
  noteInput: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: typeScale.body,
    fontFamily: fonts.semiBold,
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
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
