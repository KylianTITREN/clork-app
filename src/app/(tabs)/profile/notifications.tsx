// Notifications v2 (maquette 4c) : 3 cartes blanches bordées espacées — titre
// bodySm/semiBold + sous-titre caption à gauche, toggle à droite ; réglage
// conditionnel (heure sur fond neutre, jour en chips) sous la ligne du toggle.

import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SubPageHeader } from "@/components/profile/SubPageHeader";
import { ChoiceChips } from "@/components/ui/ChoiceChips";
import { TimePickerField } from "@/components/ui/TimePickerField";
import { fonts, radius, spacing, typeScale, useThemeColors } from "@/constants/tokens";
import { addDays, isoDate } from "@/lib/dates";
import {
  applyReminderPrefs,
  ensureNotificationPermission,
  getReminderPrefs,
  saveReminderPrefs,
  type ReminderPrefs,
  type ReminderShift,
} from "@/lib/reminder-service";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

const WEEKDAY_OPTIONS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Jeu" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sam" },
  { value: 7, label: "Dim" },
] as const;

export default function NotificationsSettingsScreen() {
  const colors = useThemeColors();
  const { session } = useAuth();

  const [prefs, setPrefs] = useState<ReminderPrefs | null>(null);
  const [shifts, setShifts] = useState<ReminderShift[]>([]);

  const userId = session?.user.id;

  useEffect(() => {
    getReminderPrefs().then(setPrefs);
  }, []);

  // Créneaux des 7 prochains jours, pour planifier veille + matin.
  useEffect(() => {
    if (!userId) return;
    const today = isoDate(new Date());
    supabase
      .from("shifts")
      .select("date, start_at, end_at, break_minutes")
      .eq("user_id", userId)
      .gte("date", today)
      .lte("date", addDays(today, 6))
      .then(({ data }) => setShifts((data as ReminderShift[]) ?? []));
  }, [userId]);

  async function update(patch: Partial<ReminderPrefs>) {
    if (!prefs) return;
    const isTurningOn =
      (patch.eveEnabled === true && !prefs.eveEnabled) ||
      (patch.morningEnabled === true && !prefs.morningEnabled) ||
      (patch.scanEnabled === true && !prefs.scanEnabled);
    const next: ReminderPrefs = { ...prefs, ...patch };
    setPrefs(next);
    if (isTurningOn) {
      // Premier toggle ON : on demande la permission — silencieux si refusée.
      await ensureNotificationPermission();
    }
    await saveReminderPrefs(next);
    await applyReminderPrefs(next, shifts);
  }

  function renderSwitch(value: boolean, onValueChange: (next: boolean) => void) {
    return (
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.surfaceMuted, true: colors.accent }}
        ios_backgroundColor={colors.surfaceMuted}
        thumbColor="#FFFFFF"
      />
    );
  }

  function renderToggleRow(title: string, subtitle: string, toggle: React.ReactNode) {
    return (
      <View style={styles.toggleRow}>
        <View style={styles.toggleTextBox}>
          <Text style={[styles.toggleTitle, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.toggleSubtitle, { color: colors.textMuted }]}>{subtitle}</Text>
        </View>
        {toggle}
      </View>
    );
  }

  if (!prefs) {
    return (
      <SafeAreaView edges={["top"]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.content}>
          <SubPageHeader title="Notifications" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <SubPageHeader title="Notifications" />

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {renderToggleRow(
            "La veille au soir",
            "« Demain : 09:00–17:00 (1h de pause) »",
            renderSwitch(prefs.eveEnabled, (next) => update({ eveEnabled: next })),
          )}
          {prefs.eveEnabled ? (
            <View style={[styles.timeRow, { backgroundColor: colors.background }]}>
              <Text style={[styles.fieldLabel, styles.fieldLabelGrow, { color: colors.textMuted }]}>
                Heure du rappel
              </Text>
              <TimePickerField value={prefs.eveTime} onChange={(time) => update({ eveTime: time })} />
            </View>
          ) : null}
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {renderToggleRow(
            "Le matin même",
            "Petit rappel avant de partir",
            renderSwitch(prefs.morningEnabled, (next) => update({ morningEnabled: next })),
          )}
          {prefs.morningEnabled ? (
            <View style={[styles.timeRow, { backgroundColor: colors.background }]}>
              <Text style={[styles.fieldLabel, styles.fieldLabelGrow, { color: colors.textMuted }]}>
                Heure du rappel
              </Text>
              <TimePickerField
                value={prefs.morningTime}
                onChange={(time) => update({ morningTime: time })}
              />
            </View>
          ) : null}
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {renderToggleRow(
            "Rappel scan hebdo",
            "« Pense à scanner la semaine prochaine »",
            renderSwitch(prefs.scanEnabled, (next) => update({ scanEnabled: next })),
          )}
          {prefs.scanEnabled ? (
            <View style={styles.dayBlock}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Jour du rappel</Text>
              <ChoiceChips
                options={WEEKDAY_OPTIONS}
                value={prefs.scanWeekday}
                onChange={(weekday) => update({ scanWeekday: weekday })}
              />
              <Text style={[styles.dayFootnote, { color: colors.textDisabled }]}>
                Envoyé à 18:00 le jour choisi.
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={[styles.footnote, { color: colors.textMuted }]}>
          Les notifications de fin de scan (push) arriveront avec une prochaine version.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { padding: spacing.lg, gap: 12 },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: 12,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  toggleTextBox: { flex: 1, gap: 2 },
  toggleTitle: { fontSize: typeScale.bodySm, fontFamily: fonts.semiBold },
  toggleSubtitle: { fontSize: typeScale.caption, fontFamily: fonts.regular, lineHeight: 17 },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.input,
    paddingHorizontal: 12,
    paddingVertical: spacing.sm,
  },
  fieldLabel: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  fieldLabelGrow: { flex: 1 },
  dayBlock: { gap: spacing.sm },
  dayFootnote: { fontSize: typeScale.tiny, fontFamily: fonts.medium },
  footnote: {
    fontSize: typeScale.caption,
    fontFamily: fonts.regular,
    textAlign: "center",
    paddingHorizontal: spacing.md,
  },
});
