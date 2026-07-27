import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { router } from "expo-router";

import { NavRow } from "@/components/profile/NavRow";
import { SavePill } from "@/components/profile/SavePill";
import { Section } from "@/components/profile/Section";
import { SubPageHeader } from "@/components/profile/SubPageHeader";
import { TextField } from "@/components/ui/TextField";
import { TimePickerField } from "@/components/ui/TimePickerField";
import { fonts, radius, spacing, typeScale, useThemeColors } from "@/constants/tokens";
import { isPremiumPlan, showPremiumGate, usePlan } from "@/lib/plan-service";
import {
  ensurePermission,
  listWritableCalendars,
  loadExportTarget,
  saveExportTarget,
  type ExportTarget,
  type WritableCalendar,
} from "@/lib/calendar-export";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { useAuth } from "@/providers/auth-provider";

type FormSnapshot = {
  displayName: string;
  planningNames: string;
  employeeId: string;
};

export default function PlanningSettingsScreen() {
  const colors = useThemeColors();
  const { session } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [planningNames, setPlanningNames] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState<FormSnapshot | null>(null);

  const userId = session?.user.id;

  const isDirty =
    savedSnapshot != null &&
    (displayName !== savedSnapshot.displayName ||
      planningNames !== savedSnapshot.planningNames ||
      employeeId !== savedSnapshot.employeeId);

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
      };
      setDisplayName(snapshot.displayName);
      setPlanningNames(snapshot.planningNames);
      setEmployeeId(snapshot.employeeId);
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
      })
      .eq("id", userId);
    setIsSaving(false);
    if (error) {
      Alert.alert("Erreur", "Sauvegarde impossible : " + error.message);
    } else {
      setSavedSnapshot({ displayName, planningNames, employeeId });
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

  const plan = usePlan();
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

          <Section
            icon="finger-print"
            iconBg={colors.accentMuted}
            iconColor={colors.accent}
            title="Sur le planning"
            subtitle="Pour retrouver TA ligne automatiquement"
          >
            <TextField label="Prénom (ou pseudo)" placeholder="Capucine" value={displayName} onChangeText={setDisplayName} />
            <TextField
              label="Nom sur le planning"
              placeholder="DUPONT Capucine, Capucine"
              hint="Plusieurs variantes possibles, séparées par des virgules."
              value={planningNames}
              onChangeText={setPlanningNames}
            />
            <TextField label="ID employé (optionnel)" placeholder="ex: 10684512" value={employeeId} onChangeText={setEmployeeId} />
          </Section>

          {/* v2 : réglages fusionnés — créneaux types et pause vivent ici. */}
          <NavRow
            icon="flash"
            iconBg={colors.accentMuted}
            iconColor={colors.accent}
            title="Créneaux types"
            subtitle="Matin / Journée / Soir — heure + pause, éditables"
            onPress={() => router.push("/profile/presets")}
          />
          <NavRow
            icon="cafe"
            iconBg={colors.shiftCpSoft}
            iconColor={colors.shiftCp}
            title="Pause déjeuner"
            subtitle="Durée par défaut · seuil · heure habituelle"
            onPress={() => router.push("/profile/pause")}
          />

          <Section
            icon="storefront"
            iconBg={colors.shiftRhSoft}
            iconColor={colors.shiftRh}
            title="Horaires du magasin"
            subtitle="Pour t'indiquer « tu ouvres / tu fermes »"
          >
            <Text style={[styles.storeLabel, { color: colors.textMuted }]}>OUVRE À</Text>
            <TimePickerField
              value={storeOpen}
              placeholder="--:--"
              onChange={(time) => void saveStoreHours(time, storeClose)}
            />
            <Text style={[styles.storeLabel, { color: colors.textMuted }]}>FERME À</Text>
            <TimePickerField
              value={storeClose}
              placeholder="--:--"
              onChange={(time) => void saveStoreHours(storeOpen, time)}
            />
            <Text style={[styles.storeHint, { color: colors.textMuted }]}>
              Si ton créneau commence à l'ouverture, tu ouvres ; s'il finit à la
              fermeture, tu fermes. Les mentions O/F lues sur le planning priment.
            </Text>
          </Section>

          <Section
            icon="calendar"
            iconBg={colors.accentMuted}
            iconColor={colors.accent}
            title="Export calendrier"
            subtitle="Où envoyer tes semaines"
          >
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
          </Section>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
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
  storeHint: {
    fontSize: typeScale.caption,
    fontFamily: fonts.regular,
    lineHeight: 17,
  },
  storeLabel: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
    letterSpacing: 0.6,
  },
});
