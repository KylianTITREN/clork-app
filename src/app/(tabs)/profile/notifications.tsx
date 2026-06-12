import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Section } from "@/components/profile/Section";
import { SubPageHeader } from "@/components/profile/SubPageHeader";
import { ChoiceChips } from "@/components/ui/ChoiceChips";
import { TimePickerField } from "@/components/ui/TimePickerField";
import { fonts, spacing, typeScale, useThemeColors } from "@/constants/tokens";
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

        <Section
          icon="moon"
          iconBg={colors.shiftMeetingSoft}
          iconColor={colors.shiftMeeting}
          title="La veille au soir"
          subtitle="Tes horaires de demain, en un coup d'œil"
          right={renderSwitch(prefs.eveEnabled, (next) => update({ eveEnabled: next }))}
        >
          <Text style={[styles.description, { color: colors.textMuted }]}>
            « Demain : 09:00–17:00 (1h de pause) » — uniquement si tu travailles le lendemain.
          </Text>
          {prefs.eveEnabled ? (
            <View style={styles.settingRow}>
              <Text style={[styles.settingRowLabel, { color: colors.textMuted }]}>HEURE DU RAPPEL</Text>
              <TimePickerField value={prefs.eveTime} onChange={(time) => update({ eveTime: time })} />
            </View>
          ) : null}
        </Section>

        <Section
          icon="sunny"
          iconBg={colors.accentMuted}
          iconColor={colors.accent}
          title="Le matin même"
          subtitle="Petit rappel avant de partir"
          right={renderSwitch(prefs.morningEnabled, (next) => update({ morningEnabled: next }))}
        >
          <Text style={[styles.description, { color: colors.textMuted }]}>
            Tes horaires du jour, envoyés le matin — uniquement les jours travaillés.
          </Text>
          {prefs.morningEnabled ? (
            <View style={styles.settingRow}>
              <Text style={[styles.settingRowLabel, { color: colors.textMuted }]}>HEURE DU RAPPEL</Text>
              <TimePickerField value={prefs.morningTime} onChange={(time) => update({ morningTime: time })} />
            </View>
          ) : null}
        </Section>

        <Section
          icon="camera"
          iconBg={colors.shiftRhSoft}
          iconColor={colors.shiftRh}
          title="Rappel scan hebdo"
          subtitle="Pour ne jamais rater la semaine suivante"
          right={renderSwitch(prefs.scanEnabled, (next) => update({ scanEnabled: next }))}
        >
          <Text style={[styles.description, { color: colors.textMuted }]}>
            « Pense à scanner le planning de la semaine prochaine 📸 » à 18:00, le jour de ton choix.
          </Text>
          {prefs.scanEnabled ? (
            <View style={styles.settingBlock}>
              <Text style={[styles.settingLabel, { color: colors.textMuted }]}>JOUR DU RAPPEL</Text>
              <ChoiceChips
                options={WEEKDAY_OPTIONS}
                value={prefs.scanWeekday}
                onChange={(weekday) => update({ scanWeekday: weekday })}
              />
            </View>
          ) : null}
        </Section>

        <Text style={[styles.footnote, { color: colors.textMuted }]}>
          Les notifications de fin de scan (push) arriveront avec une prochaine version.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  description: { fontSize: typeScale.caption, fontFamily: fonts.semiBold, lineHeight: 18 },
  settingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  settingBlock: { gap: spacing.xs },
  settingLabel: { fontSize: typeScale.caption, fontFamily: fonts.bold, letterSpacing: 0.6 },
  settingRowLabel: { flex: 1, fontSize: typeScale.caption, fontFamily: fonts.bold, letterSpacing: 0.6 },
  footnote: {
    fontSize: typeScale.caption,
    fontFamily: fonts.regular,
    textAlign: "center",
    paddingHorizontal: spacing.md,
  },
});
