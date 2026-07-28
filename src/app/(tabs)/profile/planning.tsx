import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { router, useFocusEffect } from "expo-router";

import { SavePill } from "@/components/profile/SavePill";
import { SubPageHeader } from "@/components/profile/SubPageHeader";
import { Button } from "@/components/ui/Button";
import { ChoiceChips } from "@/components/ui/ChoiceChips";
import { TextField } from "@/components/ui/TextField";
import {
  fonts,
  radius,
  softShadow,
  spacing,
  typeScale,
  useThemeColors,
} from "@/constants/tokens";
import { isPremiumPlan, showPremiumGate, usePlan } from "@/lib/plan-service";
import {
  ensurePermission,
  listWritableCalendars,
  loadExportTarget,
  saveExportTarget,
  type ExportTarget,
  type WritableCalendar,
} from "@/lib/calendar-export";
import { DEFAULT_PRESETS, MAX_PRESETS, loadPresets, type ShiftPreset } from "@/lib/preset-service";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { useAuth } from "@/providers/auth-provider";

import { FREE_PRESET_LIMIT, PauseDurationChips, presetDisplayName } from "./presets";

// Seuils de déclenchement de la pause (recopiés de pause.tsx, fusion v2).
const THRESHOLD_OPTIONS = [
  { value: 4, label: "4h" },
  { value: 5, label: "5h" },
  { value: 6, label: "6h" },
  { value: 7, label: "7h" },
  { value: 8, label: "8h" },
] as const;

// Durées de pause proposées (maquette : Aucune / 1h / 30 min / 45 min + Autre…).
const PAUSE_OPTIONS = [
  { minutes: 0, label: "Aucune" },
  { minutes: 60, label: "1h" },
  { minutes: 30, label: "30 min" },
  { minutes: 45, label: "45 min" },
] as const;

type FormSnapshot = {
  displayName: string;
  planningNames: string;
  employeeId: string;
  breakMinutes: number;
  breakThreshold: number;
  breakStart: string | null;
};

/** Pause d'un créneau type au format court de la maquette (« 30 min », « 1h »). */
function formatPresetBreak(minutes: number): string | null {
  if (minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest > 0 ? `${hours}h${String(rest).padStart(2, "0")}` : `${hours}h`;
}

/** "HH:MM" (ou null) → Date pour le sélecteur natif. */
function toPickerDate(value: string | null): Date {
  const date = new Date();
  if (value) {
    const [hours, minutes] = value.split(":").map(Number);
    date.setHours(hours || 0, minutes || 0, 0, 0);
  } else {
    date.setHours(9, 0, 0, 0);
  }
  return date;
}

function toHHMM(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

type TimeSettingPillProps = {
  label: string;
  value: string | null;
  placeholder: string;
  onChange: (value: string) => void;
  /** Si fourni et valeur posée : petite croix d'effacement dans la pilule. */
  onClear?: () => void;
};

/**
 * Pilule réglage v2 (maquette Scan & horaires) : fond neutre r11, label tiny
 * uppercase à gauche + heure body/bold à droite dans la MÊME pilule — tout le
 * bloc ouvre le sélecteur d'heure natif (roue iOS / horloge Android).
 */
function TimeSettingPill({ label, value, placeholder, onChange, onClear }: TimeSettingPillProps) {
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
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={open}
        style={({ pressed }) => [
          styles.settingPill,
          { backgroundColor: colors.background, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Text
          style={[styles.settingPillLabel, { color: colors.textMuted }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {label}
        </Text>
        <View style={styles.settingPillValueBox}>
          <Text style={[styles.settingPillValue, { color: value ? colors.text : colors.textDisabled }]}>
            {value ?? placeholder}
          </Text>
          {value && onClear ? (
            <Pressable onPress={onClear} hitSlop={8} accessibilityLabel={`Effacer — ${label}`}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
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

/** Carte blanche v2 : titre + sous-titre DANS la carte (maquette Scan & horaires). */
function SettingsCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const colors = useThemeColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>{subtitle}</Text>
      </View>
      {children}
    </View>
  );
}

export default function PlanningSettingsScreen() {
  const colors = useThemeColors();
  const { session } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [planningNames, setPlanningNames] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  // Pause déjeuner — logique de pause.tsx fusionnée ici (la page reste en place).
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [breakThreshold, setBreakThreshold] = useState(6);
  const [breakStart, setBreakStart] = useState<string | null>(null);
  // Le seuil s'édite en dépliant les chips sous la pilule « Si journée ≥ ».
  const [isPickingThreshold, setIsPickingThreshold] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState<FormSnapshot | null>(null);

  const userId = session?.user.id;

  const isDirty =
    savedSnapshot != null &&
    (displayName !== savedSnapshot.displayName ||
      planningNames !== savedSnapshot.planningNames ||
      employeeId !== savedSnapshot.employeeId ||
      breakMinutes !== savedSnapshot.breakMinutes ||
      breakThreshold !== savedSnapshot.breakThreshold ||
      breakStart !== savedSnapshot.breakStart);

  const loadProfile = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single<Profile>();
    if (error) {
      Alert.alert("Erreur", "Impossible de charger ton profil : " + error.message);
      return;
    }
    if (data) {
      const snapshot: FormSnapshot = {
        displayName: data.display_name,
        planningNames: data.employee_aliases.join(", "),
        employeeId: data.employee_id ?? "",
        breakMinutes: data.break_default_minutes ?? 0,
        breakThreshold: data.break_threshold_hours ?? 6,
        breakStart: data.break_start_default ? data.break_start_default.slice(0, 5) : null,
      };
      setDisplayName(snapshot.displayName);
      setPlanningNames(snapshot.planningNames);
      setEmployeeId(snapshot.employeeId);
      setBreakMinutes(snapshot.breakMinutes);
      setBreakThreshold(snapshot.breakThreshold);
      setBreakStart(snapshot.breakStart);
      setSavedSnapshot(snapshot);
    }
  }, [userId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  async function handleSave() {
    if (!userId) return;
    if (!displayName.trim()) {
      Alert.alert("Champ manquant", "Ton prénom (ou pseudo) est obligatoire.");
      return;
    }
    setIsSaving(true);
    const aliases = planningNames
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim(),
        employee_aliases: aliases,
        employee_id: employeeId.trim() || null,
        break_default_minutes: breakMinutes,
        break_threshold_hours: breakThreshold,
        break_start_default: breakStart,
      })
      .eq("id", userId);
    setIsSaving(false);
    if (error) {
      Alert.alert("Erreur", "Sauvegarde impossible : " + error.message);
    } else {
      setSavedSnapshot({
        displayName,
        planningNames,
        employeeId,
        breakMinutes,
        breakThreshold,
        breakStart,
      });
    }
  }

  // --- Horaires du magasin (v2) : « tu ouvres / tu fermes » sur l'accueil.
  // Les mentions O/F lues sur le planning priment sur cette déduction.
  const [storeOpen, setStoreOpen] = useState<string | null>(null);
  const [storeClose, setStoreClose] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("profiles")
      .select("store_open_time, store_close_time")
      .eq("id", userId)
      .single<{ store_open_time: string | null; store_close_time: string | null }>()
      .then(({ data }) => {
        setStoreOpen(data?.store_open_time?.slice(0, 5) ?? null);
        setStoreClose(data?.store_close_time?.slice(0, 5) ?? null);
      });
  }, [userId]);

  async function saveStoreHours(open: string | null, close: string | null) {
    if (!userId) return;
    setStoreOpen(open);
    setStoreClose(close);
    await supabase
      .from("profiles")
      .update({ store_open_time: open, store_close_time: close })
      .eq("id", userId);
  }

  // --- Créneaux types : aperçu inline, édition sur /profile/presets.
  const [presets, setPresets] = useState<ShiftPreset[]>(DEFAULT_PRESETS);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      loadPresets().then((loaded) => {
        if (!cancelled) setPresets(loaded);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const plan = usePlan();
  const isPremium = isPremiumPlan(plan);

  /** Création gérée par l'éditeur plein écran ; gates plan/maximum ici. */
  function handleAddPreset() {
    if (!isPremium && presets.length >= FREE_PRESET_LIMIT) {
      showPremiumGate("Les créneaux types illimités");
      return;
    }
    if (presets.length >= MAX_PRESETS) {
      Alert.alert("Limite atteinte", `Maximum ${MAX_PRESETS} créneaux types.`);
      return;
    }
    router.push({ pathname: "/profile/presets", params: { new: "1" } });
  }

  // --- Export calendrier : dédié (nom au choix) ou calendrier existant ---
  const [exportTarget, setExportTarget] = useState<ExportTarget>({ mode: "dedicated", name: "Clork" });
  const [calendars, setCalendars] = useState<WritableCalendar[] | null>(null);

  useEffect(() => {
    loadExportTarget().then(setExportTarget);
  }, []);

  async function pickTarget(target: ExportTarget) {
    setExportTarget(target);
    await saveExportTarget(target);
  }

  async function showCalendarList() {
    const granted = await ensurePermission();
    if (!granted) return;
    setCalendars(await listWritableCalendars());
  }

  // Sur carte blanche, les inputs passent en surface bordée pour contraster.
  const inputOnCard = { backgroundColor: colors.surface };

  return (
    <SafeAreaView edges={["top"]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
        >
          <SubPageHeader
            title="Scan & horaires"
            right={
              savedSnapshot != null ? (
                <SavePill isDirty={isDirty} isSaving={isSaving} onPress={handleSave} />
              ) : null
            }
          />

          <SettingsCard title="Sur le planning" subtitle="Pour retrouver ta ligne automatiquement">
            <TextField
              label="Prénom"
              placeholder="Capucine"
              value={displayName}
              onChangeText={setDisplayName}
              style={inputOnCard}
            />
            <TextField
              label="Nom sur le planning"
              placeholder="DUPONT Capucine, Capucine"
              hint="Plusieurs variantes possibles, séparées par des virgules."
              value={planningNames}
              onChangeText={setPlanningNames}
              style={inputOnCard}
            />
            <TextField
              label="ID employé (optionnel)"
              placeholder="ex : 10684512"
              value={employeeId}
              onChangeText={setEmployeeId}
              style={inputOnCard}
            />
          </SettingsCard>

          <SettingsCard title="Horaires du magasin" subtitle="Pour savoir quand tu ouvres ou fermes">
            <View style={styles.pillsRow}>
              <TimeSettingPill
                label="Ouvre"
                value={storeOpen}
                placeholder="09:00"
                onChange={(time) => void saveStoreHours(time, storeClose)}
              />
              <TimeSettingPill
                label="Ferme"
                value={storeClose}
                placeholder="21:00"
                onChange={(time) => void saveStoreHours(storeOpen, time)}
              />
            </View>
            <Text style={[styles.storeHint, { color: colors.textDisabled }]}>
              Créneau qui commence à l'ouverture → tu ouvres ; qui finit à la fermeture → tu
              fermes. Les mentions O/F du planning priment.
            </Text>
          </SettingsCard>

          <SettingsCard
            title="Créneaux types"
            subtitle={
              isPremium
                ? "Proposés en un tap à l'ajout manuel"
                : `Proposés en un tap à l'ajout manuel · Limite gratuite : ${FREE_PRESET_LIMIT}`
            }
          >
            {presets.map((preset) => {
              const presetBreak = formatPresetBreak(preset.breakMinutes);
              return (
                <Pressable
                  key={preset.id}
                  onPress={() =>
                    router.push({ pathname: "/profile/presets", params: { id: preset.id } })
                  }
                  style={({ pressed }) => [
                    styles.presetRow,
                    { backgroundColor: colors.background, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={[styles.presetName, { color: colors.text }]} numberOfLines={1}>
                    {presetDisplayName(preset.label)}
                  </Text>
                  <Text style={[styles.presetMeta, { color: colors.textMuted }]}>
                    {preset.start} – {preset.end}
                    {presetBreak ? ` · ${presetBreak}` : ""}
                  </Text>
                  <Ionicons name="chevron-forward" size={15} color={colors.textDisabled} />
                </Pressable>
              );
            })}
            <Pressable
              onPress={handleAddPreset}
              style={({ pressed }) => [
                styles.addRow,
                { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Ionicons name="add" size={16} color={colors.text} />
              {isPremium ? (
                <Text style={[styles.addLabel, { color: colors.text }]}>
                  Ajouter un créneau type
                </Text>
              ) : (
                <Text style={[styles.addLabel, { color: colors.text }]}>
                  Ajouter ({FREE_PRESET_LIMIT} max en gratuit) ·{" "}
                  <Text style={[styles.addLabelPremium, { color: colors.accent }]}>Premium</Text>
                </Text>
              )}
            </Pressable>
          </SettingsCard>

          <SettingsCard title="Pause déjeuner" subtitle="Si le planning n'imprime pas la durée payée">
            <PauseDurationChips
              value={breakMinutes}
              onChange={setBreakMinutes}
              options={PAUSE_OPTIONS}
            />

            <View style={styles.pillsRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Seuil de journée déclenchant la pause"
                onPress={() => setIsPickingThreshold((current) => !current)}
                style={({ pressed }) => [
                  styles.settingPill,
                  { backgroundColor: colors.background, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text
                  style={[styles.settingPillLabel, { color: colors.textMuted }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  Si journée ≥
                </Text>
                <Text style={[styles.settingPillValue, { color: colors.text }]}>
                  {breakThreshold}h
                </Text>
              </Pressable>
              <TimeSettingPill
                label="Heure habituelle"
                value={breakStart}
                placeholder="12:30"
                onChange={setBreakStart}
                onClear={() => setBreakStart(null)}
              />
            </View>

            {isPickingThreshold ? (
              <ChoiceChips
                options={THRESHOLD_OPTIONS}
                value={breakThreshold}
                onChange={(value) => {
                  setBreakThreshold(value);
                  setIsPickingThreshold(false);
                }}
              />
            ) : null}
          </SettingsCard>

          <SettingsCard title="Export calendrier" subtitle="Où envoyer tes semaines">
            {!isPremiumPlan(plan) ? (
              <Pressable
                onPress={() => showPremiumGate("L'export vers ton calendrier")}
                style={[styles.lockedCard, { backgroundColor: colors.surfaceMuted }]}
              >
                <Ionicons name="lock-closed" size={16} color={colors.textMuted} />
                <Text style={[styles.lockedCardText, { color: colors.textMuted }]}>
                  L'export calendrier (et son paramétrage) est réservé à Clork
                  Premium ⭐ — touche pour en savoir plus.
                </Text>
              </Pressable>
            ) : (
            <>
            <Pressable
              onPress={() => pickTarget({ mode: "dedicated", name: exportTarget.mode === "dedicated" ? exportTarget.name : "Clork" })}
              style={[styles.calRow, { borderColor: exportTarget.mode === "dedicated" ? colors.text : colors.border }]}
            >
              <Text style={[styles.calTitle, { color: colors.text }]}>Calendrier dédié</Text>
              <Text style={[styles.calMeta, { color: colors.textMuted }]}>Créé pour toi, nom au choix</Text>
            </Pressable>
            {exportTarget.mode === "dedicated" ? (
              <TextField
                label="Nom du calendrier"
                placeholder="Clork"
                value={exportTarget.name}
                onChangeText={(name) => setExportTarget({ mode: "dedicated", name })}
                onEndEditing={() => void saveExportTarget(exportTarget.mode === "dedicated" && exportTarget.name.trim() ? exportTarget : { mode: "dedicated", name: "Clork" })}
                style={inputOnCard}
              />
            ) : null}
            <Pressable
              onPress={() => (calendars === null ? showCalendarList() : setCalendars(null))}
              style={[styles.calRow, { borderColor: exportTarget.mode === "existing" ? colors.text : colors.border }]}
            >
              <Text style={[styles.calTitle, { color: colors.text }]}>
                {exportTarget.mode === "existing" ? exportTarget.title : "Utiliser un calendrier existant…"}
              </Text>
              <Text style={[styles.calMeta, { color: colors.textMuted }]}>
                {calendars === null ? "Toucher pour choisir parmi tes calendriers" : "Toucher pour replier la liste"}
              </Text>
            </Pressable>
            {calendars !== null ? (
              calendars.map((calendar) => {
                const selected = exportTarget.mode === "existing" && exportTarget.calendarId === calendar.id;
                return (
                  <Pressable
                    key={calendar.id}
                    onPress={() => pickTarget({ mode: "existing", calendarId: calendar.id, title: calendar.title })}
                    style={[styles.calRow, { borderColor: selected ? colors.text : colors.border }]}
                  >
                    <Text style={[styles.calTitle, { color: colors.text }]}>{calendar.title}</Text>
                    {calendar.sourceName ? (
                      <Text style={[styles.calMeta, { color: colors.textMuted }]}>{calendar.sourceName}</Text>
                    ) : null}
                  </Pressable>
                );
              })
            ) : null}
            </>
            )}
          </SettingsCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: 12 },
  // Carte blanche v2 (maquette : bord 1px, r16, padding 18, gap 12).
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md + 2,
    gap: 12,
  },
  cardTitle: {
    fontSize: typeScale.body,
    fontFamily: fonts.bold,
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
    marginTop: 2,
  },
  // Rangées de 2 pilules réglage côte à côte (Ouvre/Ferme, Si journée/Heure).
  pillsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  // Pilule réglage : fond neutre r11, label tiny uppercase + valeur bold.
  settingPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    borderRadius: radius.input,
    minHeight: 46,
    paddingVertical: 10,
    paddingLeft: 13,
    paddingRight: 11,
  },
  settingPillLabel: {
    flexShrink: 1,
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  settingPillValueBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  settingPillValue: {
    fontSize: typeScale.body,
    fontFamily: fonts.bold,
  },
  // Sélecteur d'heure natif des pilules (feuille iOS, cf. TimePickerField).
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
  storeHint: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.medium,
    lineHeight: 16,
  },
  // Rangée créneau type : « Matin   06:00 – 13:00 · 30 min   › ».
  presetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    borderRadius: radius.input,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  presetName: {
    flex: 1,
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
  },
  presetMeta: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.bold,
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
  addLabelPremium: {
    fontFamily: fonts.bold,
  },
  // Export calendrier (logique inchangée, habillage carte v2).
  calRow: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 1,
  },
  calTitle: { fontSize: typeScale.body, fontFamily: fonts.extraBold },
  lockedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  lockedCardText: {
    flex: 1,
    fontSize: typeScale.caption,
    fontFamily: fonts.bold,
    lineHeight: 17,
  },
  calMeta: { fontSize: typeScale.caption, fontFamily: fonts.regular },
});
