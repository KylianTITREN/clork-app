// Écran plein « Corriger » (maquette 4b, 3ᵉ téléphone) — édition de TOUS les
// créneaux d'un jour PENDANT la validation d'un scan. Remplace l'ancienne
// modale d'édition (retour Kylian : « quand je modifie un créneau ça me refait
// la popin »). Modèle : DayEditorScreen — type appliqué à la journée, une carte
// par créneau, ajout / suppression de créneau, total payé du jour. Insets
// MANUELS (SafeAreaView rend 0 dans un Modal RN), pied avec coussin bas.

import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useEffect, useMemo, useState } from "react";
// prettier-ignore
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { TimePickerField } from "@/components/ui/TimePickerField";
// prettier-ignore
import { fonts, letterSpacing, radius, shiftTypeLabel, softShadow, spacing, typeScale, useThemeColors, type ShiftPeriod, type ShiftType } from "@/constants/tokens";
// prettier-ignore
import { DEFAULT_PRESETS, loadPresets, presetHasTimes, type ShiftPreset } from "@/lib/preset-service";
import { breakMinutes, type DraftShift } from "@/lib/scan-service";

const DAY_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

// Types proposés (maquette : Travail / Repos / CP / Formation / Réunion). Un
// type déjà porté par le jour mais absent de la liste y est ajouté.
const CORRECTION_TYPES: readonly ShiftType[] = ["work", "off", "cp", "training", "meeting"];
// Types « avec horaires » : masquent horaires, créneaux types, pause et total.
const TIMED_TYPES: readonly ShiftType[] = ["work", "training", "meeting", "overtime"];
// Même garde-fou que l'éditeur de jour de la vue semaine.
const MAX_SLOTS = 3;

// Libellés courts de la maquette (« CP » plutôt que « Congé payé »).
const TYPE_CHIP_LABEL: Partial<Record<ShiftType, string>> = { cp: "CP" };

const PAUSE_OPTIONS: readonly { minutes: number; label: string }[] = [
  { minutes: 0, label: "Aucune" },
  { minutes: 60, label: "1h" },
  { minutes: 30, label: "30 min" },
];
const MAX_CUSTOM_PAUSE_MINUTES = 600;
// Rangée de créneaux types : 3 par ligne façon maquette.
const MAX_PRESET_CHIPS = 6;

function typeChipLabel(type: ShiftType): string {
  return TYPE_CHIP_LABEL[type] ?? shiftTypeLabel[type];
}

/** Heures décimales entre deux "HH:MM" (fin > début supposé). */
function hoursBetween(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh * 60 + em - (sh * 60 + sm)) / 60;
}

/** « 7,25h » — format court français. */
function formatHours(value: number): string {
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}h`;
}

/** 75 → « 1h15 », 45 → « 45 min ». */
function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h${String(rest).padStart(2, "0")}` : `${hours}h`;
}

function toPickerDate(value: string | null): Date {
  const date = new Date();
  const [h, m] = (value ?? "09:00").split(":").map(Number);
  date.setHours(h || 9, m || 0, 0, 0);
  return date;
}

function toHHMM(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

// --- Carte DÉBUT / FIN (sélecteur d'heure du wizard) ---------------------------

type TimeCardProps = {
  label: string;
  value: string | null;
  /** Carte en cours d'édition : bordure + libellé accent (maquette). */
  isActive: boolean;
  onFocus: () => void;
  onChange: (value: string) => void;
};

function TimeCard({ label, value, isActive, onFocus, onChange }: TimeCardProps) {
  const colors = useThemeColors();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(() => toPickerDate(value));

  function open() {
    setDraft(toPickerDate(value));
    onFocus();
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
        accessibilityRole="button"
        accessibilityLabel={`${label} : ${value ?? "non renseigné"}`}
        style={[
          styles.timeCard,
          {
            // Fond du jour : la carte de créneau qui l'entoure est en surface.
            backgroundColor: colors.background,
            borderColor: isActive ? colors.accent : colors.border,
          },
        ]}
      >
        <Text style={[styles.timeCardLabel, { color: isActive ? colors.accent : colors.textMuted }]}>
          {label}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.timeCardValue, { color: value ? colors.text : colors.textDisabled }]}
        >
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
                softShadow,
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

// --- Chips de durée de pause ---------------------------------------------------

type PauseChipsProps = {
  value: number;
  onChange: (minutes: number) => void;
};

/**
 * Aucune / 1h / 30 min + une 4ᵉ chip : la valeur libre courante (« 1h15 ✎ »,
 * encre) ou « Autre… » quand la durée tombe sur un préréglage.
 */
function PauseChips({ value, onChange }: PauseChipsProps) {
  const colors = useThemeColors();
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState("");
  const isCustomValue = value > 0 && !PAUSE_OPTIONS.some((option) => option.minutes === value);

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
        {PAUSE_OPTIONS.map(({ minutes, label }) => {
          const selected = value === minutes;
          return (
            <Pressable
              key={minutes}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => {
                setIsEditing(false);
                onChange(minutes);
              }}
              style={[
                styles.chip,
                selected
                  ? { backgroundColor: colors.ink, borderColor: colors.ink }
                  : { backgroundColor: colors.background, borderColor: colors.border },
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

        <Pressable
          onPress={openEditor}
          accessibilityRole="button"
          accessibilityState={{ selected: isCustomValue }}
          style={[
            styles.chip,
            isCustomValue
              ? [styles.customChip, { backgroundColor: colors.ink, borderColor: colors.ink }]
              : { backgroundColor: colors.background, borderColor: colors.border },
          ]}
        >
          <Text
            style={[
              styles.chipLabel,
              isCustomValue
                ? [styles.chipLabelSelected, { color: colors.onInk }]
                : { color: colors.textSoft },
            ]}
          >
            {isCustomValue ? formatMinutes(value) : "Autre…"}
          </Text>
          {isCustomValue ? <Ionicons name="pencil" size={12} color={colors.onInk} /> : null}
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
              { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
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

// --- Créneaux en cours d'édition ----------------------------------------------

/** Créneau du jour tel qu'il vit dans la liste de brouillons du wizard. */
export type CorrectionSlot = {
  /** Index du brouillon dans `ctx.drafts` — renvoyé tel quel à la sauvegarde. */
  index: number;
  draft: DraftShift;
};

type EditSlot = {
  /** Clé de rendu stable (les positions bougent quand on supprime). */
  key: string;
  /** Index du brouillon d'origine, null = créneau ajouté ici. */
  index: number | null;
  /** Brouillon d'origine : garde note, rature manuscrite, surlignage. */
  base: DraftShift | null;
  start: string | null; // "HH:MM"
  end: string | null;
  pauseMinutes: number;
  pauseStart: string | null;
  period: ShiftPeriod | null;
  /** Ajouté via « + Ajouter un créneau » : en-tête accent. */
  isNew: boolean;
};

let slotKeyCounter = 0;
function nextSlotKey(): string {
  slotKeyCounter += 1;
  return `correction-slot-${slotKeyCounter}`;
}

function blankSlot(index: number | null, base: DraftShift | null, isNew: boolean): EditSlot {
  return {
    key: nextSlotKey(),
    index,
    base,
    start: null,
    end: null,
    pauseMinutes: 0,
    pauseStart: null,
    period: null,
    isNew,
  };
}

/** Brouillon vierge d'un créneau ajouté (type posé à l'enregistrement). */
function blankDraft(date: string): DraftShift {
  return {
    date,
    type: "work",
    start: null,
    end: null,
    durationHours: null,
    breakStart: null,
    period: null,
    note: null,
    fromHandwriting: false,
    highlighted: false,
    include: true,
  };
}

/**
 * Une carte par créneau horodaté retenu. Sans créneau horodaté (repos, jour non
 * lu, créneaux déjà retirés), une carte vierge greffée sur le PREMIER brouillon
 * du jour : passer le jour en « Travail » réutilise cette ligne au lieu d'en
 * créer une seconde (l'alignement du journal de corrections est préservé).
 */
function hydrateSlots(slots: CorrectionSlot[]): EditSlot[] {
  const timed = slots.filter(({ draft }) => draft.include && draft.start && draft.end);
  if (timed.length > 0) {
    return timed.map(({ index, draft }) => ({
      key: nextSlotKey(),
      index,
      base: draft,
      start: draft.start,
      end: draft.end,
      pauseMinutes: breakMinutes(draft),
      pauseStart: draft.breakStart,
      period: draft.period,
      isNew: false,
    }));
  }
  const fallback = slots[0] ?? null;
  return [blankSlot(fallback?.index ?? null, fallback?.draft ?? null, false)];
}

// --- Écran ---------------------------------------------------------------------

export type ScanCorrectionScreenProps = {
  /** Jour corrigé (YYYY-MM-DD) — l'écran édite TOUS ses créneaux. */
  date: string;
  /** Créneaux du jour (brouillons du scan, jamais écrits en base). */
  slots: CorrectionSlot[];
  /** Horaires LUS par le scan (1ᵉʳ créneau lu) : badge repère, null si rien lu. */
  readTimes?: { start: string; end: string } | null;
  onCancel: () => void;
  /** Lot à appliquer — index null = créneau AJOUTÉ, include:false = retiré. */
  onSave: (next: { index: number | null; draft: DraftShift }[]) => void;
};

export function ScanCorrectionScreen({
  date,
  slots,
  readTimes = null,
  onCancel,
  onSave,
}: ScanCorrectionScreenProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  // null = types d'origine conservés (un créneau réunion lu dans les notes ne
  // devient pas « Travail » parce qu'on a corrigé les horaires du jour).
  const [typeChoice, setTypeChoice] = useState<ShiftType | null>(null);
  const [editSlots, setEditSlots] = useState<EditSlot[]>(() => hydrateSlots(slots));
  // Créneaux retirés : marqués include:false à l'enregistrement, jamais
  // supprimés de la liste du wizard (alignement du journal de corrections).
  const [removedSlots, setRemovedSlots] = useState<EditSlot[]>([]);
  const [activeEdge, setActiveEdge] = useState<{ key: string; edge: "start" | "end" } | null>(null);
  const [presets, setPresets] = useState<ShiftPreset[]>(DEFAULT_PRESETS);

  // Créneaux types de l'utilisateur — un tap remplit début, fin, pause et type.
  useEffect(() => {
    let cancelled = false;
    loadPresets().then((loaded) => {
      if (!cancelled) setPresets(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Type du jour : celui du créneau retenu le plus représentatif, sauf choix
  // explicite dans les chips (qui s'applique alors à toute la journée).
  const primaryType = useMemo<ShiftType>(() => {
    const included = slots.filter(({ draft }) => draft.include);
    const timed = included.find(({ draft }) => draft.start && draft.end);
    if (timed) return timed.draft.type;
    if (included.length > 0) return included[0].draft.type;
    // Aucun créneau retenu : jour de repos (lu comme tel, ou vidé ici même).
    // Jour totalement absent du planning : on part sur Travail à remplir.
    return slots.length > 0 ? "off" : "work";
  }, [slots]);
  const dayType = typeChoice ?? primaryType;
  const isTimed = TIMED_TYPES.includes(dayType);

  // Un type hors liste (porté par le scan ou par un créneau type) reste
  // représentable : il est ajouté à la suite des chips standards.
  const typeOptions = useMemo(() => {
    const extras = [primaryType, dayType].filter(
      (candidate, position, all) =>
        !CORRECTION_TYPES.includes(candidate) && all.indexOf(candidate) === position,
    );
    return extras.length > 0 ? [...CORRECTION_TYPES, ...extras] : CORRECTION_TYPES;
  }, [primaryType, dayType]);

  const timedPresets = useMemo(
    () => presets.filter((preset) => presetHasTimes(preset)).slice(0, MAX_PRESET_CHIPS),
    [presets],
  );

  // Total payé du jour : somme des créneaux valides, pauses déduites.
  const paidHours = useMemo(() => {
    if (!isTimed) return 0;
    return editSlots.reduce((total, slot) => {
      if (!slot.start || !slot.end || slot.end <= slot.start) return total;
      return total + Math.max(0, hoursBetween(slot.start, slot.end) - slot.pauseMinutes / 60);
    }, 0);
  }, [isTimed, editSlots]);

  const rawTitle = DAY_FORMATTER.format(new Date(`${date}T12:00:00`));

  function updateSlot(key: string, patch: Partial<EditSlot>) {
    setEditSlots((current) => current.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function applyPreset(key: string, preset: ShiftPreset) {
    setTypeChoice(preset.type);
    updateSlot(key, {
      start: preset.start,
      end: preset.end,
      pauseMinutes: preset.breakMinutes,
      period: preset.period ?? null,
    });
  }

  function addSlot() {
    setEditSlots((current) =>
      current.length >= MAX_SLOTS ? current : [...current, blankSlot(null, null, true)],
    );
  }

  function removeSlot(slot: EditSlot) {
    setEditSlots((current) => current.filter((s) => s.key !== slot.key));
    // Un créneau ajouté puis retiré n'a jamais existé : rien à marquer.
    if (slot.index != null && slot.base) {
      setRemovedSlots((current) => [...current, slot]);
    }
  }

  function confirmRemoveSlot(slot: EditSlot, position: number) {
    const isLast = editSlots.length === 1;
    Alert.alert(
      "Supprimer ce créneau ?",
      isLast
        ? "Ce jour ne sera pas enregistré comme travaillé — il passera en jour de repos."
        : `Le créneau ${position + 1} ne sera pas enregistré.`,
      [
        { text: "Annuler", style: "cancel" },
        { text: "Supprimer", style: "destructive", onPress: () => removeSlot(slot) },
      ],
    );
  }

  /** Type appliqué à un créneau : choix explicite, sinon type d'origine. */
  function slotType(base: DraftShift | null): ShiftType {
    return typeChoice ?? base?.type ?? "work";
  }

  function handleSave() {
    const next: { index: number | null; draft: DraftShift }[] = [];
    // Créneaux retirés : conservés dans la liste, simplement non enregistrés.
    for (const removed of removedSlots) {
      if (removed.index == null || !removed.base) continue;
      next.push({ index: removed.index, draft: { ...removed.base, include: false } });
    }

    if (isTimed) {
      for (let i = 0; i < editSlots.length; i++) {
        const slot = editSlots[i];
        if (!slot.start || !slot.end) {
          Alert.alert("Horaires manquants", `Choisis le début et la fin du créneau ${i + 1}.`);
          return;
        }
        if (slot.end <= slot.start) {
          Alert.alert("Horaire invalide", `La fin du créneau ${i + 1} doit être après son début.`);
          return;
        }
      }
      for (const slot of editSlots) {
        const base = slot.base ?? blankDraft(date);
        const start = slot.start as string;
        const end = slot.end as string;
        // Le brouillon encode la pause via durationHours (amplitude − pause) :
        // même convention que le reste du pipeline de validation du scan.
        next.push({
          index: slot.index,
          draft: {
            ...base,
            date,
            type: slotType(slot.base),
            start,
            end,
            durationHours: Math.max(0, hoursBetween(start, end) - slot.pauseMinutes / 60),
            breakStart: slot.pauseMinutes > 0 ? slot.pauseStart : null,
            period: slot.period,
            include: true, // corriger un créneau = vouloir le garder
          },
        });
      }
    } else if (editSlots.length > 0) {
      // Journée sans horaires (Repos, CP…) : une seule ligne, le reste sort.
      const [first, ...rest] = editSlots;
      const base = first.base ?? blankDraft(date);
      next.push({
        index: first.index,
        draft: {
          ...base,
          date,
          type: dayType,
          start: null,
          end: null,
          durationHours: null,
          breakStart: null,
          period: null,
          include: true,
        },
      });
      for (const slot of rest) {
        if (slot.index == null || !slot.base) continue;
        next.push({ index: slot.index, draft: { ...slot.base, include: false } });
      }
    }

    onSave(next);
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel}>
      {/* Insets MANUELS : SafeAreaView rend 0 dans un Modal RN (notch). */}
      <View
        style={[
          styles.screen,
          { backgroundColor: colors.background, paddingTop: Math.max(insets.top, 12) + 4 },
        ]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          {/* En-tête : retour + « Corriger » + date longue + badge « lu : … » */}
          <View style={styles.header}>
            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
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
              <Text style={[styles.headerTitle, { color: colors.text }]}>Corriger</Text>
              <Text style={[styles.headerSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
                {rawTitle}
              </Text>
            </View>
            {readTimes ? (
              <View style={[styles.readBadge, { backgroundColor: colors.shiftCpSoft }]}>
                <Text style={[styles.readBadgeText, { color: colors.shiftCp }]}>
                  lu : {readTimes.start}–{readTimes.end}
                </Text>
              </View>
            ) : null}
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Type de journée — sélection ACCENT (chips de type de la maquette) */}
            <View>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                C'était quoi ce jour ?
              </Text>
              <View style={styles.chipsRow}>
                {typeOptions.map((option) => {
                  const selected = option === dayType;
                  return (
                    <Pressable
                      key={option}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setTypeChoice(option)}
                      style={[
                        styles.chip,
                        selected
                          ? { backgroundColor: colors.accent, borderColor: colors.accent }
                          : { backgroundColor: colors.surface, borderColor: colors.border },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipLabel,
                          selected
                            ? [styles.chipLabelSelected, { color: colors.onAccent }]
                            : { color: colors.textSoft },
                        ]}
                      >
                        {typeChipLabel(option)}
                        {selected ? " ✓" : ""}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {isTimed ? (
              <>
                {/* Une carte par créneau : horaires, créneaux types, pause */}
                {editSlots.map((slot, position) => (
                  <View
                    key={slot.key}
                    style={[
                      styles.slotCard,
                      {
                        backgroundColor: colors.surface,
                        borderColor: slot.isNew ? colors.accent : colors.border,
                      },
                    ]}
                  >
                    <View style={styles.slotHeader}>
                      <Text style={[styles.cardLabel, { color: colors.textMuted }]}>
                        {editSlots.length > 1 ? `Créneau ${position + 1}` : "Horaires"}
                        {slot.isNew ? (
                          <Text style={{ color: colors.accent }}> — nouveau</Text>
                        ) : null}
                      </Text>
                      {/* Suppression discrète : le créneau ne sera pas enregistré */}
                      <Pressable
                        onPress={() => confirmRemoveSlot(slot, position)}
                        accessibilityRole="button"
                        accessibilityLabel={`Supprimer le créneau ${position + 1}`}
                        hitSlop={10}
                        style={styles.slotDelete}
                      >
                        <Ionicons name="trash-outline" size={13} color={colors.danger} />
                        <Text style={[styles.slotDeleteLabel, { color: colors.danger }]}>
                          Supprimer
                        </Text>
                      </Pressable>
                    </View>

                    <View style={styles.timeRow}>
                      <TimeCard
                        label="Début"
                        value={slot.start}
                        isActive={activeEdge?.key === slot.key && activeEdge.edge === "start"}
                        onFocus={() => setActiveEdge({ key: slot.key, edge: "start" })}
                        onChange={(value) => updateSlot(slot.key, { start: value })}
                      />
                      <Text style={[styles.timeArrow, { color: colors.textDisabled }]}>→</Text>
                      <TimeCard
                        label="Fin"
                        value={slot.end}
                        isActive={activeEdge?.key === slot.key && activeEdge.edge === "end"}
                        onFocus={() => setActiveEdge({ key: slot.key, edge: "end" })}
                        onChange={(value) => updateSlot(slot.key, { end: value })}
                      />
                    </View>

                    {timedPresets.length > 0 ? (
                      <View>
                        <View style={styles.presetRow}>
                          {timedPresets.map((preset) => (
                            <Pressable
                              key={preset.id}
                              accessibilityRole="button"
                              accessibilityLabel={`Créneau type ${preset.start} à ${preset.end}`}
                              onPress={() => applyPreset(slot.key, preset)}
                              style={[
                                styles.presetChip,
                                { backgroundColor: colors.background, borderColor: colors.border },
                              ]}
                            >
                              <Text
                                numberOfLines={1}
                                style={[styles.presetChipLabel, { color: colors.text }]}
                              >
                                {preset.start}–{preset.end}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                        {position === 0 ? (
                          <Text style={[styles.presetCaption, { color: colors.textMuted }]}>
                            tes créneaux types — un tap pour remplir
                          </Text>
                        ) : null}
                      </View>
                    ) : null}

                    {/* Durée de pause + heure de prise */}
                    <Text style={[styles.cardLabel, { color: colors.textMuted }]}>
                      Durée de pause
                    </Text>
                    <PauseChips
                      value={slot.pauseMinutes}
                      onChange={(minutes) => updateSlot(slot.key, { pauseMinutes: minutes })}
                    />
                    {slot.pauseMinutes > 0 ? (
                      <TimePickerField
                        value={slot.pauseStart}
                        onChange={(value) => updateSlot(slot.key, { pauseStart: value })}
                        placeholder="12:30"
                        label="Débute à"
                        variant="row"
                      />
                    ) : null}
                  </View>
                ))}

                {/* Deuxième créneau du jour : réunion, coupure, renfort… */}
                {editSlots.length < MAX_SLOTS ? (
                  <Pressable
                    onPress={addSlot}
                    accessibilityRole="button"
                    style={[styles.addRow, { borderColor: colors.border }]}
                  >
                    <Text style={[styles.addRowLabel, { color: colors.textMuted }]}>
                      + Ajouter un créneau
                    </Text>
                  </Pressable>
                ) : null}

                {/* Total payé live du jour : amplitudes − pauses */}
                <View style={[styles.totalBar, { backgroundColor: colors.accentMuted }]}>
                  <Text style={[styles.totalLabel, { color: colors.textSoft }]}>Total payé</Text>
                  <Text style={[styles.totalValue, { color: colors.accent }]}>
                    {formatHours(paidHours)}
                  </Text>
                </View>
              </>
            ) : null}
          </ScrollView>

          {/* Pied : coussin bas = insets.bottom + spacing.lg */}
          <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
            <Button label="Enregistrer ✓" onPress={handleSave} />
            <Pressable onPress={onCancel} accessibilityRole="button" style={styles.cancelButton}>
              <Text style={[styles.cancelLabel, { color: colors.textMuted }]}>Annuler</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
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
    borderRadius: radius.input,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextBox: { flex: 1, gap: 1 },
  headerTitle: {
    fontSize: typeScale.heading,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.heading,
  },
  headerSubtitle: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
  },
  readBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  readBadgeText: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: 14,
  },
  sectionLabel: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.bold,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  // Libellé de section À L'INTÉRIEUR d'une carte (l'espacement vient du gap).
  cardLabel: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.bold,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  slotCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: 12,
  },
  slotHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  slotDelete: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  slotDeleteLabel: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
  },
  chipsRow: {
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
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  timeCard: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 14,
  },
  timeCardLabel: {
    fontSize: 10.5,
    fontFamily: fonts.semiBold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  timeCardValue: {
    fontSize: 24,
    fontFamily: fonts.bold,
    letterSpacing: -0.5,
  },
  timeArrow: {
    fontSize: 16,
    fontFamily: fonts.medium,
  },
  presetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  presetChip: {
    flexGrow: 1,
    flexBasis: "30%",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 4,
    paddingVertical: 9,
    minHeight: 40,
  },
  presetChipLabel: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
  },
  presetCaption: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.medium,
    textAlign: "center",
    marginTop: 6,
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
  totalBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  totalLabel: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
  },
  totalValue: {
    fontSize: 16,
    fontFamily: fonts.bold,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  cancelButton: {
    alignSelf: "center",
    paddingHorizontal: spacing.md,
    minHeight: 44,
    justifyContent: "center",
  },
  cancelLabel: {
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
