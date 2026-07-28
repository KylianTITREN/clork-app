// Écran plein « Édition d'un jour » (maquettes v2 écrans 2-3) : type appliqué
// à la journée, une carte par créneau (horaire géant tappable → picker natif,
// pause en chips encre, heure de prise), ajout jusqu'à 3 créneaux, total payé
// du jour (+ coupure), enregistrement par réconciliation update/insert/delete
// sur la table shifts. Présenté en Modal plein écran (slide).

import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useEffect, useMemo, useState } from "react";
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
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { TimePickerField } from "@/components/ui/TimePickerField";
import {
  fonts,
  letterSpacing,
  radius,
  shiftTypeLabel,
  spacing,
  typeScale,
  useThemeColors,
  type ShiftType,
} from "@/constants/tokens";
import { mondayOf, weekLabel } from "@/lib/dates";
import { supabase } from "@/lib/supabase";
import type { Shift } from "@/lib/types";

const DAY_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

// Types proposés pour LA JOURNÉE (maquette : Travail / Repos / CP / Formation /
// Réunion). Si le jour porte déjà un autre type (rtt, sick…), il est ajouté
// dynamiquement pour rester représentable.
const DAY_TYPES: ShiftType[] = ["work", "off", "cp", "training", "meeting"];
// Types « avec horaires » : les cartes créneaux ne s'affichent que pour eux.
const TIMED_DAY_TYPES: ShiftType[] = ["work", "training", "meeting", "overtime"];
const MAX_SLOTS = 3;

const PAUSE_PRESETS: { minutes: number; label: string }[] = [
  { minutes: 0, label: "Aucune" },
  { minutes: 60, label: "1h" },
];
const MAX_CUSTOM_PAUSE_MINUTES = 600;

type SlotDraft = {
  /** Clé de rendu stable (les index bougent quand on supprime). */
  key: string;
  /** id du shift existant en base, null = créneau ajouté dans la session. */
  id: string | null;
  start: string | null; // "HH:MM"
  end: string | null;
  pauseMinutes: number;
  pauseStart: string | null;
  /** Ajouté via « + Ajouter… » : en-tête — NOUVEAU + contour accent. */
  isNew: boolean;
};

let slotKeyCounter = 0;
function nextSlotKey(): string {
  slotKeyCounter += 1;
  return `slot-${slotKeyCounter}`;
}

function emptySlot(isNew: boolean): SlotDraft {
  return {
    key: nextSlotKey(),
    id: null,
    start: null,
    end: null,
    pauseMinutes: 0,
    pauseStart: null,
    isNew,
  };
}

function toLocalTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Heures décimales entre deux "HH:MM" (fin > début supposé). */
function hoursBetween(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  return (eh * 60 + em - (sh * 60 + sm)) / 60;
}

function formatHours(value: number): string {
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}h`;
}

/** "75" → "1h15", "45" → "45 min". */
function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h${String(rest).padStart(2, "0")}` : `${hours}h`;
}

function toPickerDate(value: string | null): Date {
  const d = new Date();
  if (value) {
    const [h, m] = value.split(":").map(Number);
    d.setHours(h || 9, m || 0, 0, 0);
  } else {
    d.setHours(9, 0, 0, 0);
  }
  return d;
}

function toHHMM(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function hydrateSlots(shifts: Shift[]): SlotDraft[] {
  const timed = shifts
    .filter((s) => s.start_at && s.end_at)
    .sort((a, b) => (a.start_at as string).localeCompare(b.start_at as string));
  if (timed.length === 0) return [emptySlot(false)];
  return timed.map((s) => ({
    key: nextSlotKey(),
    id: s.id,
    start: toLocalTime(s.start_at),
    end: toLocalTime(s.end_at),
    pauseMinutes: s.break_minutes,
    pauseStart: s.break_start ? s.break_start.slice(0, 5) : null,
    isNew: false,
  }));
}

/** « · MATIN » (le plus tôt) / « · SOIR » (le plus tard) dès 2 créneaux. */
function slotSuffixes(slots: SlotDraft[]): (string | null)[] {
  if (slots.length < 2) return slots.map(() => null);
  // Un créneau sans heure (fraîchement ajouté) trie en dernier → SOIR.
  const sorted = slots
    .map((slot, index) => ({ index, start: slot.start ?? "99:99" }))
    .sort((a, b) => a.start.localeCompare(b.start));
  const first = sorted[0].index;
  const last = sorted[sorted.length - 1].index;
  return slots.map((_, index) =>
    index === first ? " · MATIN" : index === last ? " · SOIR" : null,
  );
}

// --- Zone d'heure tappable (gros horaire) --------------------------------------

type TimeTapProps = {
  value: string | null;
  onChange: (value: string) => void;
  accessibilityLabel: string;
};

/** Gros chiffre tappable ouvrant le sélecteur natif (roue iOS / horloge Android). */
function TimeTap({ value, onChange, accessibilityLabel }: TimeTapProps) {
  const colors = useThemeColors();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(() => toPickerDate(value));

  function open() {
    setDraft(toPickerDate(value));
    setIsOpen(true);
  }

  function confirm() {
    onChange(toHHMM(draft));
    setIsOpen(false);
  }

  return (
    <>
      <Pressable
        onPress={open}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <Text style={[styles.timeTapValue, { color: value ? colors.text : colors.textDisabled }]}>
          {value ?? "--:--"}
        </Text>
      </Pressable>

      {isOpen ? (
        Platform.OS === "ios" ? (
          <Modal visible transparent animationType="fade" onRequestClose={() => setIsOpen(false)}>
            <Pressable style={styles.pickerBackdrop} onPress={() => setIsOpen(false)} />
            <View
              style={[
                styles.pickerSheet,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <DateTimePicker
                value={draft}
                mode="time"
                display="spinner"
                minuteInterval={5}
                onChange={(_, date) => date && setDraft(date)}
                locale="fr-FR"
              />
              <Button label="Valider" onPress={confirm} />
            </View>
          </Modal>
        ) : (
          <DateTimePicker
            value={draft}
            mode="time"
            display="clock"
            onChange={(event, date) => {
              setIsOpen(false);
              if (event.type === "set" && date) onChange(toHHMM(date));
            }}
          />
        )
      ) : null}
    </>
  );
}

// --- Chips de pause (sélection encre) ------------------------------------------

type PauseChipsProps = {
  value: number;
  onChange: (minutes: number) => void;
};

/** Aucune / 1h / Autre… — sélection encre, valeur libre en chip encre + crayon. */
function PauseChips({ value, onChange }: PauseChipsProps) {
  const colors = useThemeColors();
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState("");

  const isCustomValue = value > 0 && !PAUSE_PRESETS.some((p) => p.minutes === value);

  function openEditor() {
    setText(isCustomValue ? String(value) : "");
    setIsEditing(true);
  }

  function commit() {
    const minutes = Math.round(Number(text));
    if (Number.isFinite(minutes) && minutes >= 0 && minutes <= MAX_CUSTOM_PAUSE_MINUTES) {
      onChange(minutes);
    }
    setIsEditing(false);
  }

  return (
    <View style={styles.pauseBlock}>
      <View style={styles.chipsRow}>
        {PAUSE_PRESETS.map(({ minutes, label }) => {
          const selected = value === minutes;
          return (
            <Pressable
              key={minutes}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(minutes)}
              style={[
                styles.chip,
                selected
                  ? { backgroundColor: colors.ink, borderColor: colors.ink }
                  : { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text
                style={[
                  styles.chipLabel,
                  selected
                    ? [styles.chipLabelSelected, { color: colors.onInk }]
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
            style={[
              styles.chip,
              styles.customChip,
              { backgroundColor: colors.ink, borderColor: colors.ink },
            ]}
          >
            <Text style={[styles.chipLabel, styles.chipLabelSelected, { color: colors.onInk }]}>
              {formatMinutes(value)}
            </Text>
            <Ionicons name="pencil" size={12} color={colors.onInk} />
          </Pressable>
        ) : null}

        <Pressable
          onPress={openEditor}
          accessibilityRole="button"
          style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={[styles.chipLabel, { color: colors.textSoft }]}>Autre…</Text>
        </Pressable>
      </View>

      {isEditing ? (
        <View style={styles.customRow}>
          <TextInput
            value={text}
            onChangeText={setText}
            keyboardType="number-pad"
            autoFocus
            placeholder="minutes"
            placeholderTextColor={colors.textDisabled}
            onSubmitEditing={commit}
            style={[
              styles.customInput,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
          />
          <Text style={[styles.customUnit, { color: colors.textMuted }]}>min</Text>
          <Pressable
            onPress={commit}
            accessibilityRole="button"
            style={[styles.customOk, { backgroundColor: colors.ink }]}
          >
            <Text style={[styles.customOkLabel, { color: colors.onInk }]}>OK</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

// --- Écran ---------------------------------------------------------------------

type DayEditorScreenProps = {
  date: string; // "YYYY-MM-DD"
  shifts: Shift[]; // créneaux existants du jour (peut être vide)
  userId: string;
  onClose: (didChange: boolean) => void;
};

export function DayEditorScreen({ date, shifts, userId, onClose }: DayEditorScreenProps) {
  const colors = useThemeColors();
  const [type, setType] = useState<ShiftType>(() => shifts[0]?.type ?? "work");
  const [slots, setSlots] = useState<SlotDraft[]>(() => hydrateSlots(shifts));
  const [isSaving, setIsSaving] = useState(false);
  // Horaires du magasin (profil) : badge « Tu ouvres » / « Tu fermes ».
  const [storeHours, setStoreHours] = useState<{ open: string | null; close: string | null }>({
    open: null,
    close: null,
  });

  useEffect(() => {
    supabase
      .from("profiles")
      .select("store_open_time, store_close_time")
      .eq("id", userId)
      .single<{ store_open_time: string | null; store_close_time: string | null }>()
      .then(({ data }) => {
        setStoreHours({
          open: data?.store_open_time?.slice(0, 5) ?? null,
          close: data?.store_close_time?.slice(0, 5) ?? null,
        });
      });
  }, [userId]);

  const isTimed = TIMED_DAY_TYPES.includes(type);
  const hadExistingShifts = shifts.length > 0;

  const typeOptions = useMemo(() => {
    const initial = shifts[0]?.type;
    return initial && !DAY_TYPES.includes(initial) ? [...DAY_TYPES, initial] : DAY_TYPES;
  }, [shifts]);

  const rawTitle = DAY_FORMATTER.format(new Date(`${date}T12:00:00`));
  const title = rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1);
  const subtitle = `Semaine du ${weekLabel(mondayOf(new Date(`${date}T12:00:00`)))}`;

  const suffixes = useMemo(() => slotSuffixes(slots), [slots]);

  // Créneaux complets (début + fin cohérents), triés — total, coupure, badge.
  const completeSlots = useMemo(
    () =>
      slots
        .filter((s): s is SlotDraft & { start: string; end: string } =>
          Boolean(s.start && s.end && s.end > s.start),
        )
        .sort((a, b) => a.start.localeCompare(b.start)),
    [slots],
  );

  const totalHours = useMemo(
    () =>
      completeSlots.reduce(
        (acc, s) => acc + Math.max(0, hoursBetween(s.start, s.end) - s.pauseMinutes / 60),
        0,
      ),
    [completeSlots],
  );

  // Coupure = premier trou entre deux créneaux consécutifs.
  const coupure = useMemo(() => {
    for (let i = 0; i < completeSlots.length - 1; i++) {
      if (completeSlots[i].end < completeSlots[i + 1].start) {
        return `${completeSlots[i].end} – ${completeSlots[i + 1].start}`;
      }
    }
    return null;
  }, [completeSlots]);

  const badge = useMemo(() => {
    if (!isTimed || completeSlots.length === 0) return null;
    const firstStart = completeSlots[0].start;
    const lastEnd = completeSlots[completeSlots.length - 1].end;
    if (storeHours.open && firstStart <= storeHours.open) return "Tu ouvres";
    if (storeHours.close && lastEnd >= storeHours.close) return "Tu fermes";
    return null;
  }, [isTimed, completeSlots, storeHours]);

  function updateSlot(key: string, patch: Partial<SlotDraft>) {
    setSlots((current) => current.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function removeSlot(key: string) {
    setSlots((current) => current.filter((s) => s.key !== key));
  }

  function addSlot() {
    setSlots((current) => (current.length >= MAX_SLOTS ? current : [...current, emptySlot(true)]));
  }

  function saveFailed(message: string) {
    setIsSaving(false);
    Alert.alert("Enregistrement impossible", message);
  }

  async function handleSave() {
    const existingIds = shifts.map((s) => s.id);
    let toDelete: string[] = [];
    const updates: { id: string; payload: Record<string, unknown> }[] = [];
    const inserts: Record<string, unknown>[] = [];

    if (isTimed) {
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (!slot.start || !slot.end) {
          Alert.alert(
            "Horaires manquants",
            `Renseigne le début et la fin du créneau ${i + 1}.`,
          );
          return;
        }
        if (slot.end <= slot.start) {
          Alert.alert(
            "Horaire invalide",
            `La fin du créneau ${i + 1} doit être après son début.`,
          );
          return;
        }
      }
      const sorted = [...slots].sort((a, b) => (a.start as string).localeCompare(b.start as string));
      for (let i = 0; i < sorted.length - 1; i++) {
        if ((sorted[i + 1].start as string) < (sorted[i].end as string)) {
          Alert.alert(
            "Créneaux en conflit",
            "Deux créneaux se chevauchent — ajuste les horaires.",
          );
          return;
        }
      }
      const keptIds = new Set(slots.map((s) => s.id).filter((id): id is string => id != null));
      toDelete = existingIds.filter((id) => !keptIds.has(id));
      for (const slot of slots) {
        const payload = {
          date,
          start_at: new Date(`${date}T${slot.start}:00`).toISOString(),
          end_at: new Date(`${date}T${slot.end}:00`).toISOString(),
          type,
          break_minutes: slot.pauseMinutes,
          break_start: slot.pauseMinutes > 0 ? slot.pauseStart : null,
          is_edited: true,
        };
        if (slot.id) {
          updates.push({ id: slot.id, payload });
        } else {
          inserts.push({ ...payload, user_id: userId, source: "manual" });
        }
      }
    } else {
      // Journée sans horaires (Repos, CP…) : une seule ligne, les autres partent.
      const payload = {
        date,
        start_at: null,
        end_at: null,
        type,
        break_minutes: 0,
        break_start: null,
        is_edited: true,
      };
      const keepId = existingIds[0] ?? null;
      if (keepId) {
        updates.push({ id: keepId, payload });
        toDelete = existingIds.slice(1);
      } else {
        inserts.push({ ...payload, user_id: userId, source: "manual" });
      }
    }

    setIsSaving(true);
    if (toDelete.length > 0) {
      const { error } = await supabase.from("shifts").delete().in("id", toDelete);
      if (error) {
        saveFailed(error.message);
        return;
      }
    }
    for (const { id, payload } of updates) {
      const { error } = await supabase.from("shifts").update(payload).eq("id", id);
      if (error) {
        saveFailed(error.message);
        return;
      }
    }
    if (inserts.length > 0) {
      const { error } = await supabase.from("shifts").insert(inserts);
      if (error) {
        saveFailed(error.message);
        return;
      }
    }
    setIsSaving(false);
    onClose(true);
  }

  function handleDeleteDay() {
    Alert.alert("Supprimer la journée ?", "Tous les créneaux de ce jour seront supprimés.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase
            .from("shifts")
            .delete()
            .in("id", shifts.map((s) => s.id));
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
    <Modal visible animationType="slide" onRequestClose={() => onClose(false)}>
      <SafeAreaView
        edges={["top", "bottom"]}
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          {/* En-tête : retour + date longue + badge ouverture/fermeture */}
          <View style={styles.header}>
            <Pressable
              onPress={() => onClose(false)}
              accessibilityLabel="Retour"
              hitSlop={8}
              style={[
                styles.backButton,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Ionicons name="chevron-back" size={18} color={colors.text} />
            </Pressable>
            <View style={styles.headerTextBox}>
              <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
                {title}
              </Text>
              <Text style={[styles.headerSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
                {subtitle}
              </Text>
            </View>
            {badge ? (
              <View style={[styles.headerBadge, { backgroundColor: colors.accentMuted }]}>
                <Text style={[styles.headerBadgeText, { color: colors.accent }]}>{badge}</Text>
              </View>
            ) : null}
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Carte TYPE — s'applique à la journée entière */}
            <View
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Type</Text>
              <View style={styles.chipsRow}>
                {typeOptions.map((option) => {
                  const selected = option === type;
                  return (
                    <Pressable
                      key={option}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setType(option)}
                      style={[
                        styles.chip,
                        selected
                          ? { backgroundColor: colors.ink, borderColor: colors.ink }
                          : { backgroundColor: colors.surface, borderColor: colors.border },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipLabel,
                          selected
                            ? [styles.chipLabelSelected, { color: colors.onInk }]
                            : { color: colors.textSoft },
                        ]}
                      >
                        {shiftTypeLabel[option]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Une carte par créneau — masquées pour les journées sans horaires */}
            {isTimed
              ? slots.map((slot, index) => (
                  <View
                    key={slot.key}
                    style={[
                      styles.card,
                      {
                        backgroundColor: colors.surface,
                        borderColor: slot.isNew ? colors.accent : colors.border,
                      },
                    ]}
                  >
                    <View style={styles.slotHeader}>
                      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                        {`Créneau ${index + 1}`}
                        {suffixes[index] ?? ""}
                        {slot.isNew ? (
                          <Text style={{ color: colors.accent }}> — Nouveau</Text>
                        ) : null}
                      </Text>
                      {slots.length > 1 ? (
                        <Pressable
                          onPress={() => removeSlot(slot.key)}
                          hitSlop={10}
                          accessibilityLabel={`Supprimer le créneau ${index + 1}`}
                        >
                          <Text style={[styles.slotDelete, { color: colors.danger }]}>
                            Supprimer
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>

                    {/* Gros horaire : deux zones tappables → picker natif */}
                    <View style={[styles.timeBox, { backgroundColor: colors.background }]}>
                      <TimeTap
                        value={slot.start}
                        onChange={(v) => updateSlot(slot.key, { start: v })}
                        accessibilityLabel={`Heure de début du créneau ${index + 1}`}
                      />
                      <Text style={[styles.timeArrow, { color: colors.textMuted }]}>→</Text>
                      <TimeTap
                        value={slot.end}
                        onChange={(v) => updateSlot(slot.key, { end: v })}
                        accessibilityLabel={`Heure de fin du créneau ${index + 1}`}
                      />
                    </View>

                    {/* Pause + heure de prise */}
                    <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Pause</Text>
                    <PauseChips
                      value={slot.pauseMinutes}
                      onChange={(minutes) => updateSlot(slot.key, { pauseMinutes: minutes })}
                    />
                    {slot.pauseMinutes > 0 ? (
                      <TimePickerField
                        value={slot.pauseStart}
                        onChange={(v) => updateSlot(slot.key, { pauseStart: v })}
                        placeholder="12:30"
                        label="Prise à"
                        variant="row"
                      />
                    ) : null}
                  </View>
                ))
              : null}

            {/* Rangée pointillée d'ajout (max 3 créneaux) */}
            {isTimed && slots.length < MAX_SLOTS ? (
              <Pressable
                onPress={addSlot}
                accessibilityRole="button"
                style={[styles.addRow, { borderColor: colors.border }]}
              >
                <Text style={[styles.addRowLabel, { color: colors.textMuted }]}>
                  {`+ Ajouter un ${slots.length + 1}ᵉ créneau ce jour`}
                </Text>
              </Pressable>
            ) : null}

            {/* Total payé du jour (+ coupure entre créneaux) */}
            {isTimed && completeSlots.length > 0 ? (
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: colors.textSoft }]} numberOfLines={1}>
                  {coupure ? `Total du jour · coupure ${coupure}` : "Total du jour"}
                </Text>
                <Text style={[styles.totalValue, { color: colors.accent }]}>
                  {formatHours(totalHours)} payées
                </Text>
              </View>
            ) : null}

            <Button label="Enregistrer" onPress={handleSave} isLoading={isSaving} />

            {hadExistingShifts ? (
              <Pressable
                onPress={handleDeleteDay}
                accessibilityRole="button"
                style={styles.deleteDayButton}
              >
                <Text style={[styles.deleteDayLabel, { color: colors.danger }]}>
                  Supprimer la journée
                </Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 4,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextBox: {
    flex: 1,
    gap: 1,
  },
  headerTitle: {
    fontSize: typeScale.title - 4,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.heading,
  },
  headerSubtitle: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
  },
  headerBadge: {
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  headerBadgeText: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: 12,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: 12,
  },
  sectionLabel: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  slotHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  slotDelete: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
  },
  timeBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    borderRadius: radius.sm,
    paddingVertical: 14,
  },
  timeTapValue: {
    fontSize: 29,
    fontFamily: fonts.bold,
    letterSpacing: -0.6,
  },
  timeArrow: {
    fontSize: 20,
    fontFamily: fonts.medium,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  chipLabel: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
  },
  chipLabelSelected: {
    fontFamily: fonts.semiBold,
  },
  customChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pauseBlock: {
    gap: spacing.sm,
  },
  customRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  customInput: {
    width: 96,
    borderRadius: radius.input,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: typeScale.body,
    fontFamily: fonts.medium,
  },
  customUnit: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
  },
  customOk: {
    borderRadius: 10,
    paddingHorizontal: 18,
    minHeight: 44,
    justifyContent: "center",
  },
  customOkLabel: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
  },
  addRow: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: "dashed",
    paddingVertical: 14,
    alignItems: "center",
  },
  addRowLabel: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  totalLabel: {
    flex: 1,
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
  },
  totalValue: {
    fontSize: typeScale.body,
    fontFamily: fonts.bold,
  },
  deleteDayButton: {
    alignSelf: "center",
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    justifyContent: "center",
  },
  deleteDayLabel: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  pickerSheet: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xxl,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
});
