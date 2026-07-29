// Écran plein « Corriger » (maquette 4b, 3ᵉ téléphone) — édition d'un créneau
// PENDANT la validation d'un scan. Remplace l'ancienne modale d'édition
// (retour Kylian : « quand je modifie un créneau ça me refait la popin »).
// Modèle : DayEditorScreen — Modal plein écran, insets MANUELS (SafeAreaView
// rend 0 dans un Modal RN), pied avec coussin bas.

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
// type déjà porté par le créneau mais absent de la liste y est ajouté.
const CORRECTION_TYPES: readonly ShiftType[] = ["work", "off", "cp", "training", "meeting"];
// Types « avec horaires » : masquent horaires, créneaux types, pause et total.
const TIMED_TYPES: readonly ShiftType[] = ["work", "training", "meeting", "overtime"];

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
            backgroundColor: colors.surface,
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

        <Pressable
          onPress={openEditor}
          accessibilityRole="button"
          accessibilityState={{ selected: isCustomValue }}
          style={[
            styles.chip,
            isCustomValue
              ? [styles.customChip, { backgroundColor: colors.ink, borderColor: colors.ink }]
              : { backgroundColor: colors.surface, borderColor: colors.border },
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
              { backgroundColor: colors.background, borderColor: colors.border, color: colors.text },
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

export type ScanCorrectionScreenProps = {
  /** Créneau en cours de correction (brouillon du scan, jamais écrit en base). */
  draft: DraftShift;
  /** Index du brouillon dans la liste du wizard — renvoyé tel quel à la sauvegarde. */
  index: number;
  /** Horaires LUS par le scan : badge repère, absent si le scan n'a rien lu. */
  readTimes: { start: string; end: string } | null;
  onCancel: () => void;
  onSave: (index: number, next: DraftShift) => void;
};

export function ScanCorrectionScreen({
  draft,
  index,
  readTimes,
  onCancel,
  onSave,
}: ScanCorrectionScreenProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  const [type, setType] = useState<ShiftType>(draft.type);
  const [start, setStart] = useState<string | null>(draft.start);
  const [end, setEnd] = useState<string | null>(draft.end);
  const [pauseMinutes, setPauseMinutes] = useState<number>(() => breakMinutes(draft));
  const [pauseStart, setPauseStart] = useState<string | null>(draft.breakStart);
  const [period, setPeriod] = useState<ShiftPeriod | null>(draft.period);
  const [activeEdge, setActiveEdge] = useState<"start" | "end">("start");
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

  const isTimed = TIMED_TYPES.includes(type);

  // Un type hors liste (porté par le scan ou par un créneau type) reste
  // représentable : il est ajouté à la suite des chips standards.
  const typeOptions = useMemo(() => {
    const extras = [draft.type, type].filter(
      (candidate, position, all) =>
        !CORRECTION_TYPES.includes(candidate) && all.indexOf(candidate) === position,
    );
    return extras.length > 0 ? [...CORRECTION_TYPES, ...extras] : CORRECTION_TYPES;
  }, [draft.type, type]);

  const timedPresets = useMemo(
    () => presets.filter((preset) => presetHasTimes(preset)).slice(0, MAX_PRESET_CHIPS),
    [presets],
  );

  const paidHours = useMemo(() => {
    if (!isTimed || !start || !end || end <= start) return 0;
    return Math.max(0, hoursBetween(start, end) - pauseMinutes / 60);
  }, [isTimed, start, end, pauseMinutes]);

  const rawTitle = DAY_FORMATTER.format(new Date(`${draft.date}T12:00:00`));

  function applyPreset(preset: ShiftPreset) {
    setType(preset.type);
    setStart(preset.start);
    setEnd(preset.end);
    setPauseMinutes(preset.breakMinutes);
    setPeriod(preset.period ?? null);
  }

  function handleSave() {
    if (isTimed) {
      if (!start || !end) {
        Alert.alert("Horaires manquants", "Choisis l'heure de début et de fin.");
        return;
      }
      if (end <= start) {
        Alert.alert("Horaire invalide", "La fin doit être après le début.");
        return;
      }
    }
    // Le brouillon encode la pause via durationHours (amplitude − pause) :
    // même convention que le reste du pipeline de validation du scan.
    const next: DraftShift = {
      ...draft,
      type,
      start: isTimed ? start : null,
      end: isTimed ? end : null,
      durationHours:
        isTimed && start && end ? Math.max(0, hoursBetween(start, end) - pauseMinutes / 60) : null,
      breakStart: isTimed && pauseMinutes > 0 ? pauseStart : null,
      period: isTimed ? period : null,
      include: true, // corriger un jour = vouloir le garder
    };
    onSave(index, next);
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
                {/* Horaires : cartes DÉBUT → FIN + créneaux types en un tap */}
                <View>
                  <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Horaires</Text>
                  <View style={styles.timeRow}>
                    <TimeCard
                      label="Début"
                      value={start}
                      isActive={activeEdge === "start"}
                      onFocus={() => setActiveEdge("start")}
                      onChange={setStart}
                    />
                    <Text style={[styles.timeArrow, { color: colors.textDisabled }]}>→</Text>
                    <TimeCard
                      label="Fin"
                      value={end}
                      isActive={activeEdge === "end"}
                      onFocus={() => setActiveEdge("end")}
                      onChange={setEnd}
                    />
                  </View>

                  {timedPresets.length > 0 ? (
                    <>
                      <View style={styles.presetRow}>
                        {timedPresets.map((preset) => (
                          <Pressable
                            key={preset.id}
                            accessibilityRole="button"
                            accessibilityLabel={`Créneau type ${preset.start} à ${preset.end}`}
                            onPress={() => applyPreset(preset)}
                            style={[
                              styles.presetChip,
                              { backgroundColor: colors.surface, borderColor: colors.border },
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
                      <Text style={[styles.presetCaption, { color: colors.textMuted }]}>
                        tes créneaux types — un tap pour remplir
                      </Text>
                    </>
                  ) : null}
                </View>

                {/* Durée de pause + heure de prise */}
                <View>
                  <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                    Durée de pause
                  </Text>
                  <PauseChips value={pauseMinutes} onChange={setPauseMinutes} />
                  {pauseMinutes > 0 ? (
                    <View style={styles.pauseStartRow}>
                      <TimePickerField
                        value={pauseStart}
                        onChange={setPauseStart}
                        placeholder="12:30"
                        label="Débute à"
                        variant="row"
                      />
                    </View>
                  ) : null}
                </View>

                {/* Total payé live : amplitude − pause */}
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
            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
              style={styles.cancelButton}
            >
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
    marginTop: spacing.sm,
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
  pauseBlock: {
    gap: spacing.sm,
  },
  pauseStartRow: {
    marginTop: spacing.sm,
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
