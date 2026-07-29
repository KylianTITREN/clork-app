// Onboarding post-inscription v2 (maquette 4f) — 4 étapes « Bienvenue · n/4 »,
// TOUT skippable (dots + « Passer » sur chaque écran) :
//   1/4 nom sur le planning (prénom + écriture planning → employee_aliases)
//   2/4 horaires du magasin (Ouverture 09:00 / Fermeture 21:00)
//   3/4 pause habituelle (chips + seuil « dès que la journée dépasse 6h »)
//   4/4 rappels (veille au soir avec aperçu dynamique, matin même)
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
import { ONBOARDING_DONE_KEY, ONBOARDING_PENDING_KEY } from "@/constants/onboarding-keys";

const TOTAL_STEPS = 4;
// Seuil maquette : la pause s'applique dès que la journée dépasse 6h.
const BREAK_THRESHOLD_HOURS = 6;
// Pauses proposées (maquette 3/4) : Aucune / 30 min / 45 min / 1h.
const BREAK_CHOICES = [
  { minutes: 0, label: "Aucune" },
  { minutes: 30, label: "30 min" },
  { minutes: 45, label: "45 min" },
  { minutes: 60, label: "1h" },
] as const;

export default function OnboardingScreen() {
  const colors = useThemeColors();
  const { session } = useAuth();
  const userId = session?.user.id;

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [planningNames, setPlanningNames] = useState("");
  // Défauts maquette 2/4 : Ouverture 09:00 / Fermeture 21:00.
  const [storeOpen, setStoreOpen] = useState<string | null>("09:00");
  const [storeClose, setStoreClose] = useState<string | null>("21:00");
  const [breakMinutes, setBreakMinutes] = useState(60);
  // États maquette 4/4 : veille ON, matin OFF ; heures lues dans les prefs.
  const [eveEnabled, setEveEnabled] = useState(true);
  const [morningEnabled, setMorningEnabled] = useState(false);
  const [eveTime, setEveTime] = useState(DEFAULT_REMINDER_PREFS.eveTime);
  const [morningTime, setMorningTime] = useState(DEFAULT_REMINDER_PREFS.morningTime);

  useEffect(() => {
    void AsyncStorage.setItem(ONBOARDING_DONE_KEY, "1");
    void AsyncStorage.removeItem(ONBOARDING_PENDING_KEY);
  }, []);

  // Pré-remplit le prénom (renseigné à l'inscription) et les écritures planning.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void supabase
      .from("profiles")
      .select("display_name, employee_aliases")
      .eq("id", userId)
      .single<{ display_name: string; employee_aliases: string[] }>()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setName((prev) => prev || data.display_name);
        setPlanningNames((prev) => prev || data.employee_aliases.join(", "));
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Heures des rappels pour l'aperçu dynamique (4/4).
  useEffect(() => {
    void getReminderPrefs().then((prefs) => {
      setEveTime(prefs.eveTime);
      setMorningTime(prefs.morningTime);
    });
  }, []);

  async function persistStep(current: number) {
    if (!userId) return;
    try {
      if (current === 0) {
        const aliases = planningNames
          .split(",")
          .map((value) => value.trim())
          .filter((value) => value.length > 0);
        const patch = {
          ...(name.trim() ? { display_name: name.trim() } : {}),
          ...(aliases.length > 0 ? { employee_aliases: aliases } : {}),
        };
        if (Object.keys(patch).length > 0) {
          await supabase.from("profiles").update(patch).eq("id", userId);
        }
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
            break_threshold_hours: BREAK_THRESHOLD_HOURS,
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

  // Textes maquette 4f — exacts, écran par écran.
  const titles = [
    "Ton nom sur\nle planning",
    "Les horaires\nde ton magasin",
    "Ta pause\nhabituelle",
    "On te fait\npenser à tout ?",
  ];
  const subtitles = [
    "C'est comme ça que le scan retrouve ta ligne, tout seul.",
    "Pour te dire quand tu ouvres ou tu fermes, sans rien saisir.",
    "Pour calculer tes heures payées quand le planning ne l'imprime pas.",
    "Deux rappels utiles — tu règles les heures dans Notifications.",
  ];

  const cardStyle = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        {/* Dots (actif = pilule large) + Passer */}
        <View style={styles.header}>
          <View style={styles.dots}>
            {Array.from({ length: TOTAL_STEPS }, (_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  {
                    backgroundColor: index <= step ? colors.accent : colors.surfaceMuted,
                    width: index === step ? 18 : 6,
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
          <View>
            <Text style={[styles.stepBadge, { color: colors.accent }]}>
              Bienvenue · {step + 1}/{TOTAL_STEPS}
            </Text>
            <Text style={[styles.title, { color: colors.text }]}>{titles[step]}</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitles[step]}</Text>
          </View>

          {step === 0 ? (
            <View style={[styles.card, cardStyle]}>
              <TextField
                label="Prénom"
                autoFocus
                autoCapitalize="words"
                placeholder="Sarah"
                value={name}
                onChangeText={setName}
              />
              <TextField
                label="Tel qu'écrit sur le planning"
                autoCapitalize="characters"
                placeholder="MARTIN Sarah"
                value={planningNames}
                onChangeText={setPlanningNames}
              />
              <Text style={[styles.cardCaption, { color: colors.textMuted }]}>
                Plusieurs écritures possibles ? Sépare-les d'une virgule : « MARTIN Sarah, Sarah
                M. »
              </Text>
            </View>
          ) : null}

          {step === 1 ? (
            <>
              <View style={[styles.card, cardStyle]}>
                <View style={styles.timeRow}>
                  <View style={styles.timeCol}>
                    <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Ouverture</Text>
                    <TimePickerField value={storeOpen} placeholder="09:00" onChange={setStoreOpen} />
                  </View>
                  <View style={styles.timeCol}>
                    <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Fermeture</Text>
                    <TimePickerField value={storeClose} placeholder="21:00" onChange={setStoreClose} />
                  </View>
                </View>
                <Text style={[styles.cardCaption, { color: colors.textMuted }]}>
                  Ton créneau démarre à l'ouverture → « tu ouvres ». Il finit à la fermeture → « tu
                  fermes ». Les mentions O/F du planning priment.
                </Text>
              </View>
              <View style={[styles.noteRow, cardStyle]}>
                <View style={[styles.noteDot, { backgroundColor: colors.surfaceMuted }]} />
                <Text style={[styles.noteText, { color: colors.textMuted }]}>
                  Ça varie selon les jours ? Passe — tu pourras l'affiner dans Scan & horaires.
                </Text>
              </View>
            </>
          ) : null}

          {step === 2 ? (
            <View style={[styles.card, cardStyle]}>
              <View style={styles.chipsRow}>
                {BREAK_CHOICES.map(({ minutes, label }) => {
                  const selected = breakMinutes === minutes;
                  return (
                    <Pressable
                      key={minutes}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setBreakMinutes(minutes)}
                      style={[
                        styles.chip,
                        { backgroundColor: selected ? colors.ink : colors.background },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipLabel,
                          { color: selected ? colors.onInk : colors.textMuted },
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={[styles.thresholdRow, { backgroundColor: colors.background }]}>
                <Text style={[styles.thresholdLabel, { color: colors.textMuted }]}>
                  Dès que la journée dépasse
                </Text>
                <View style={[styles.thresholdPill, cardStyle]}>
                  <Text style={[styles.thresholdValue, { color: colors.text }]}>
                    {BREAK_THRESHOLD_HOURS}h
                  </Text>
                </View>
              </View>
              <Text style={[styles.cardCaption, { color: colors.textMuted }]}>
                Modifiable à tout moment, y compris créneau par créneau.
              </Text>
            </View>
          ) : null}

          {step === 3 ? (
            <>
              <View style={[styles.card, cardStyle]}>
                <View style={styles.toggleRow}>
                  <View style={styles.toggleText}>
                    <Text style={[styles.toggleTitle, { color: colors.text }]}>
                      La veille au soir
                    </Text>
                    {/* Aperçu dynamique : ouverture du magasin + heure du rappel. */}
                    <Text style={[styles.toggleSub, { color: colors.textMuted }]}>
                      « Demain : {storeOpen ?? "09:00"} – 17:30 » · {eveTime}
                    </Text>
                  </View>
                  <Switch
                    value={eveEnabled}
                    onValueChange={setEveEnabled}
                    trackColor={{ true: colors.accent, false: colors.surfaceMuted }}
                    thumbColor="#FFFFFF"
                  />
                </View>
                <View style={[styles.toggleSeparator, { backgroundColor: colors.separator }]} />
                <View style={styles.toggleRow}>
                  <View style={styles.toggleText}>
                    <Text style={[styles.toggleTitle, { color: colors.text }]}>Le matin même</Text>
                    <Text style={[styles.toggleSub, { color: colors.textMuted }]}>
                      Avant de partir · {morningTime}
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
              <View style={[styles.noteRow, cardStyle]}>
                <View style={[styles.noteDot, { backgroundColor: colors.accent }]} />
                <Text style={[styles.noteText, { color: colors.textMuted }]}>
                  Dernière étape : scanne ton premier planning et ta semaine se remplit toute
                  seule.
                </Text>
              </View>
            </>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          {step < TOTAL_STEPS - 1 ? (
            <Button label="Continuer" onPress={next} />
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
    gap: 5,
    alignItems: "center",
  },
  dot: {
    height: 6,
    borderRadius: radius.pill,
  },
  skip: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md - 2,
  },
  stepBadge: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  title: {
    fontSize: typeScale.title,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.title,
  },
  subtitle: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
    marginTop: 5,
    lineHeight: 20,
  },
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 18,
    gap: spacing.sm + 4,
  },
  cardCaption: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.medium,
    lineHeight: 17,
  },
  fieldLabel: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  timeRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  timeCol: {
    flex: 1,
    gap: 5,
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
  },
  noteDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  noteText: {
    flex: 1,
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
    lineHeight: 18,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    borderRadius: radius.pill,
    paddingVertical: 10,
    paddingHorizontal: 18,
    minHeight: 44,
    justifyContent: "center",
  },
  chipLabel: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
  },
  thresholdRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    borderRadius: radius.input,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  thresholdLabel: {
    flex: 1,
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
  },
  thresholdPill: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  thresholdValue: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.bold,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 4,
  },
  toggleText: { flex: 1, gap: 2 },
  toggleTitle: {
    fontSize: typeScale.body,
    fontFamily: fonts.bold,
  },
  toggleSub: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
  },
  toggleSeparator: {
    height: 1,
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
