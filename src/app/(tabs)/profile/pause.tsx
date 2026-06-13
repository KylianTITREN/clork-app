import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SavePill } from "@/components/profile/SavePill";
import { Section } from "@/components/profile/Section";
import { SubPageHeader } from "@/components/profile/SubPageHeader";
import { ChoiceChips } from "@/components/ui/ChoiceChips";
import { DurationChips } from "@/components/ui/DurationChips";
import { TimePickerField } from "@/components/ui/TimePickerField";
import { fonts, spacing, typeScale, useThemeColors } from "@/constants/tokens";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { useAuth } from "@/providers/auth-provider";

const THRESHOLD_OPTIONS = [
  { value: 4, label: "4h" },
  { value: 5, label: "5h" },
  { value: 6, label: "6h" },
  { value: 7, label: "7h" },
  { value: 8, label: "8h" },
] as const;

type FormSnapshot = {
  breakMinutes: number;
  breakThreshold: number;
  breakStart: string | null;
};

export default function PauseSettingsScreen() {
  const colors = useThemeColors();
  const { session } = useAuth();

  const [breakMinutes, setBreakMinutes] = useState(0);
  const [breakThreshold, setBreakThreshold] = useState(6);
  const [breakStart, setBreakStart] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState<FormSnapshot | null>(null);

  const userId = session?.user.id;

  const isDirty =
    savedSnapshot != null &&
    (breakMinutes !== savedSnapshot.breakMinutes ||
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
        breakMinutes: data.break_default_minutes ?? 0,
        breakThreshold: data.break_threshold_hours ?? 6,
        breakStart: data.break_start_default ? data.break_start_default.slice(0, 5) : null,
      };
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
    setIsSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        break_default_minutes: breakMinutes,
        break_threshold_hours: breakThreshold,
        break_start_default: breakStart,
      })
      .eq("id", userId);
    setIsSaving(false);
    if (error) {
      Alert.alert("Erreur", "Sauvegarde impossible : " + error.message);
    } else {
      setSavedSnapshot({ breakMinutes, breakThreshold, breakStart });
    }
  }

  return (
    <SafeAreaView edges={["top"]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <SubPageHeader
          title="Pause déjeuner"
          right={
            savedSnapshot != null ? (
              <SavePill isDirty={isDirty} isSaving={isSaving} onPress={handleSave} />
            ) : null
          }
        />

        <Section
          icon="cafe"
          iconBg={colors.shiftCpSoft}
          iconColor={colors.shiftCp}
          title="Pause déjeuner"
          subtitle="Si le planning n'imprime pas la durée payée"
        >
          <View style={styles.fieldBlock}>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>DURÉE PAR DÉFAUT</Text>
            <DurationChips value={breakMinutes} onChange={setBreakMinutes} allowCustom />
          </View>

          <View style={styles.fieldBlock}>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>DÈS QUE LA JOURNÉE ATTEINT</Text>
            <ChoiceChips options={THRESHOLD_OPTIONS} value={breakThreshold} onChange={setBreakThreshold} />
          </View>

          <View style={styles.pauseTimeRow}>
            <Text style={[styles.inlineLabel, { color: colors.textMuted }]}>HEURE HABITUELLE</Text>
            <TimePickerField value={breakStart} onChange={setBreakStart} placeholder="12:30" />
            {breakStart ? (
              <Pressable
                onPress={() => setBreakStart(null)}
                hitSlop={8}
                accessibilityLabel="Effacer l'heure habituelle"
              >
                <Ionicons name="close-circle" size={20} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  fieldBlock: { gap: spacing.xs },
  fieldLabel: { fontSize: typeScale.caption, fontFamily: fonts.bold, letterSpacing: 0.6 },
  pauseTimeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  inlineLabel: { flex: 1, fontSize: typeScale.caption, fontFamily: fonts.bold, letterSpacing: 0.6 },
});
