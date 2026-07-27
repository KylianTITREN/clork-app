// Onboarding post-inscription v2 (maquette 4f) — 4 étapes, TOUT skippable
// (dots + « Passer » sur chaque écran) :
//   1/4 nom sur le planning (alimente le matching du scan)
//   2/4 horaires du magasin (« ça varie ? passe »)
//   3/4 pause habituelle (chips + seuil)
//   4/4 rappels (2 toggles)
// → CTA final « Scanner mon premier planning » / « Plus tard ».

import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { DurationChips } from "@/components/ui/DurationChips";
import { TextField } from "@/components/ui/TextField";
import { TimePickerField } from "@/components/ui/TimePickerField";
import {
  fonts,
  letterSpacing,
  radius,
  spacing,
  typeScale,
  useThemeColors,
} from "@/constants/tokens";
import {
  DEFAULT_REMINDER_PREFS,
  applyReminderPrefs,
  getReminderPrefs,
  saveReminderPrefs,
} from "@/lib/reminder-service";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

export const ONBOARDING_DONE_KEY = "clork.onboarding-done";

const TOTAL_STEPS = 4;

export default function OnboardingScreen() {
  const colors = useThemeColors();
  const { session } = useAuth();
  const userId = session?.user.id;

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [storeOpen, setStoreOpen] = useState<string | null>(null);
  const [storeClose, setStoreClose] = useState<string | null>(null);
  const [breakMinutes, setBreakMinutes] = useState(60);
  const [breakStart, setBreakStart] = useState<string | null>("12:30");
  const [eveEnabled, setEveEnabled] = useState(true);
  const [morningEnabled, setMorningEnabled] = useState(true);

  useEffect(() => {
    void AsyncStorage.setItem(ONBOARDING_DONE_KEY, "1");
  }, []);

  async function persistStep(current: number) {
    if (!userId) return;
    try {
      if (current === 0 && name.trim()) {
        await supabase
          .from("profiles")
          .update({ display_name: name.trim() })
          .eq("id", userId);
      } else if (current === 1 && (storeOpen || storeClose)) {
        await supabase
          .from("profiles")
          .update({ store_open_time: storeOpen, store_close_time: storeClose })
          .eq("id", userId);
      } else if (current === 2) {
        await supabase
          .from("profiles")
          .update({
            break_default_minutes: breakMinutes,
            break_start_default: breakStart,
          })
          .eq("id", userId);
      } else if (current === 3) {
        const prefs = await getReminderPrefs().catch(() => DEFAULT_REMINDER_PREFS);
        const next = { ...prefs, eveEnabled, morningEnabled };
        await saveReminderPrefs(next);
        await applyReminderPrefs(next, []);
      }
    } catch {
      // Best-effort : l'onboarding ne bloque jamais.
    }
  }

  async function next() {
    await persistStep(step);
    if (step < TOTAL_STEPS - 1) setStep(step + 1);
  }

  function skip() {
    if (step < TOTAL_STEPS - 1) setStep(step + 1);
    else router.replace("/(tabs)");
  }

  async function finish(scanFirst: boolean) {
    await persistStep(3);
    if (scanFirst) router.replace("/(tabs)/scan");
    else router.replace("/(tabs)");
  }

  const titles = [
    "Comment tu t'appelles\nsur le planning ?",
    "Les horaires\nde ton magasin ?",
    "Ta pause\nhabituelle ?",
    "On te rappelle\ntes horaires ?",
  ];
  const subtitles = [
    "Ton prénom sert à retrouver TA ligne sur les plannings scannés.",
    "Pour t'indiquer quand tu ouvres ou fermes. Ça varie ? Passe.",
    "Appliquée automatiquement dès que ta journée atteint 6h.",
    "Deux petits rappels utiles — modifiables à tout moment.",
  ];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        {/* Dots + Passer */}
        <View style={styles.header}>
          <View style={styles.dots}>
            {Array.from({ length: TOTAL_STEPS }, (_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  {
                    backgroundColor: index <= step ? colors.accent : colors.surfaceMuted,
                    width: index === step ? 22 : 8,
                  },
                ]}
              />
            ))}
          </View>
          <Pressable onPress={skip} hitSlop={10}>
            <Text style={[styles.skip, { color: colors.textMuted }]}>Passer</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[styles.stepBadge, { color: colors.accent }]}>
            {step + 1}/{TOTAL_STEPS}
          </Text>
          <Text style={[styles.title, { color: colors.text }]}>{titles[step]}</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitles[step]}</Text>

          {step === 0 ? (
            <>
              <TextField
                label="Prénom (ou nom affiché)"
                autoFocus
                placeholder="Sarah"
                value={name}
                onChangeText={setName}
              />
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                Tu pourras ajouter des variantes plus tard (ex. « Sarah M. »).
              </Text>
            </>
          ) : null}

          {step === 1 ? (
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>OUVRE À</Text>
              <TimePickerField value={storeOpen} placeholder="--:--" onChange={setStoreOpen} />
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>FERME À</Text>
              <TimePickerField value={storeClose} placeholder="--:--" onChange={setStoreClose} />
            </View>
          ) : null}

          {step === 2 ? (
            <View style={styles.fieldGroup}>
              <DurationChips value={breakMinutes} onChange={setBreakMinutes} allowCustom />
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
                HEURE HABITUELLE
              </Text>
              <TimePickerField value={breakStart} placeholder="12:30" onChange={setBreakStart} />
            </View>
          ) : null}

          {step === 3 ? (
            <View style={styles.fieldGroup}>
              <View style={[styles.toggleRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.toggleText}>
                  <Text style={[styles.toggleTitle, { color: colors.text }]}>La veille au soir</Text>
                  <Text style={[styles.toggleSub, { color: colors.textMuted }]}>
                    « Demain tu bosses 9h – 17h30 » vers 20:00
                  </Text>
                </View>
                <Switch
                  value={eveEnabled}
                  onValueChange={setEveEnabled}
                  trackColor={{ true: colors.accent, false: colors.surfaceMuted }}
                  thumbColor="#FFFFFF"
                />
              </View>
              <View style={[styles.toggleRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.toggleText}>
                  <Text style={[styles.toggleTitle, { color: colors.text }]}>Le matin même</Text>
                  <Text style={[styles.toggleSub, { color: colors.textMuted }]}>
                    Un rappel de départ vers 07:30
                  </Text>
                </View>
                <Switch
                  value={morningEnabled}
                  onValueChange={setMorningEnabled}
                  trackColor={{ true: colors.accent, false: colors.surfaceMuted }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          {step < TOTAL_STEPS - 1 ? (
            <Button label="Continuer →" onPress={next} />
          ) : (
            <>
              <Button label="Scanner mon premier planning" onPress={() => finish(true)} />
              <Pressable onPress={() => finish(false)} hitSlop={8}>
                <Text style={[styles.later, { color: colors.textMuted }]}>Plus tard</Text>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  dots: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  skip: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.sm + 2,
  },
  stepBadge: {
    fontSize: typeScale.caption,
    fontFamily: fonts.bold,
    letterSpacing: 0.5,
  },
  title: {
    fontSize: typeScale.title,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.title,
  },
  subtitle: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
    marginBottom: spacing.sm,
    lineHeight: 20,
  },
  hint: {
    fontSize: typeScale.caption,
    fontFamily: fonts.regular,
  },
  fieldGroup: {
    gap: spacing.sm,
  },
  fieldLabel: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
    letterSpacing: 0.6,
    marginTop: spacing.xs,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: spacing.md,
  },
  toggleText: { flex: 1, gap: 2 },
  toggleTitle: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
  },
  toggleSub: {
    fontSize: typeScale.caption,
    fontFamily: fonts.regular,
  },
  footer: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  later: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
    textAlign: "center",
    paddingVertical: spacing.xs,
  },
});
