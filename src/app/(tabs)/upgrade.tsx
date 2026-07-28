// Création de compte depuis le mode INVITÉ (maquette « Étape 1 sur 3 ») :
//   1/3 « Comment tu t'appelles ? » (prénom → matching des scans)
//   2/3 e-mail · 3/3 mot de passe (jauge)
// La session anonyme est CONSERVÉE (updateUser) : toutes les données restent.
// Retour = revenir à l'écran appelant (ex. Partage & suivi).

import { router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { WizardFrame } from "@/components/ui/WizardFrame";
import {
  fonts,
  letterSpacing,
  radius,
  spacing,
  typeScale,
  useThemeColors,
} from "@/constants/tokens";
import { authErrorMessage } from "@/lib/auth-errors";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function passwordStrength(password: string): number {
  let score = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password) || /[^a-zA-Z0-9]/.test(password)) score += 1;
  return score;
}

const STRENGTH_LABELS = ["Trop court", "Fragile", "Correct", "Solide"] as const;

export default function GuestUpgradeScreen() {
  const colors = useThemeColors();
  const { session } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const strength = passwordStrength(password);
  const strengthColors = [colors.danger, colors.shiftCp, colors.accentSoft, colors.success];

  function goBack() {
    if (step > 1) setStep((s) => (s - 1) as 1 | 2);
    else if (router.canGoBack()) router.back();
    else router.navigate("/(tabs)/profile");
  }

  async function handleCreate() {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Au moins ${MIN_PASSWORD_LENGTH} caractères.`);
      return;
    }
    setIsSubmitting(true);
    setError(null);
    // Session anonyme conservée : on la « promeut » en compte — rien n'est perdu.
    const { error: upgradeError } = await supabase.auth.updateUser({
      email: email.trim(),
      password,
    });
    if (!upgradeError && session?.user.id && name.trim()) {
      await supabase
        .from("profiles")
        .update({ display_name: name.trim() })
        .eq("id", session.user.id);
    }
    setIsSubmitting(false);
    if (upgradeError) {
      Alert.alert("Création impossible", authErrorMessage(upgradeError));
      return;
    }
    Alert.alert(
      "Compte créé ✅",
      "Toutes tes données sont conservées. Un e-mail de confirmation t'a été envoyé pour valider ton adresse.",
      [{ text: "OK", onPress: () => (router.canGoBack() ? router.back() : router.navigate("/(tabs)")) }],
    );
  }

  return (
    <WizardFrame step={step} totalSteps={3} closeIcon="back" onClose={goBack}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step === 1 ? (
            <>
              <Text style={[styles.title, { color: colors.text }]}>
                Comment{"\n"}tu t'appelles ?
              </Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                Ton prénom sert à retrouver ta ligne sur les plannings scannés.
              </Text>
              <TextField
                label="Prénom"
                autoFocus
                autoComplete="name"
                textContentType="givenName"
                placeholder="Sarah"
                value={name}
                onChangeText={setName}
              />
              <View style={[styles.hintCard, { backgroundColor: colors.accentMuted }]}>
                <View style={[styles.hintDot, { backgroundColor: colors.accent }]} />
                <Text style={[styles.hintText, { color: colors.accentDeep }]}>
                  Tu pourras ajouter tes variantes (« MARTIN Sarah », « Sarah M. »)
                  dans Scan & horaires.
                </Text>
              </View>
            </>
          ) : step === 2 ? (
            <>
              <Text style={[styles.title, { color: colors.text }]}>
                Ton adresse{"\n"}e-mail ?
              </Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                Elle sert à retrouver ton compte — jamais à te spammer.
              </Text>
              <TextField
                label="Email"
                autoFocus
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                keyboardType="email-address"
                placeholder="sarah@exemple.fr"
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  setError(null);
                }}
              />
              {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
            </>
          ) : (
            <>
              <Text style={[styles.title, { color: colors.text }]}>
                Choisis un{"\n"}mot de passe
              </Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                {MIN_PASSWORD_LENGTH} caractères minimum — mélange lettres et chiffres pour du solide.
              </Text>
              <TextField
                label="Mot de passe"
                autoFocus
                secureToggle
                autoComplete="new-password"
                textContentType="newPassword"
                placeholder={`${MIN_PASSWORD_LENGTH} caractères minimum`}
                value={password}
                onChangeText={(value) => {
                  setPassword(value);
                  setError(null);
                }}
              />
              <View style={styles.gaugeRow}>
                {[0, 1, 2].map((index) => (
                  <View
                    key={index}
                    style={[
                      styles.gaugeSegment,
                      {
                        backgroundColor:
                          password.length > 0 && index < strength
                            ? strengthColors[strength]
                            : colors.surfaceMuted,
                      },
                    ]}
                  />
                ))}
                <Text style={[styles.gaugeLabel, { color: colors.textMuted }]}>
                  {password.length > 0 ? STRENGTH_LABELS[strength] : " "}
                </Text>
              </View>
              {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
            </>
          )}
        </ScrollView>

        {/* CTA ferré en bas (maquette). */}
        <View style={styles.footer}>
          {step === 1 ? (
            <Button
              label="Continuer →"
              onPress={() => {
                if (!name.trim()) {
                  Alert.alert("Prénom manquant", "Ton prénom sert à retrouver ta ligne.");
                  return;
                }
                setStep(2);
              }}
            />
          ) : step === 2 ? (
            <Button
              label="Continuer →"
              onPress={() => {
                if (!EMAIL_RE.test(email.trim())) {
                  setError("Saisis une adresse e-mail valide.");
                  return;
                }
                setError(null);
                setStep(3);
              }}
            />
          ) : (
            <Button label="Créer mon compte" onPress={handleCreate} isLoading={isSubmitting} />
          )}
        </View>
      </KeyboardAvoidingView>
    </WizardFrame>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontSize: typeScale.title,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.title,
    marginTop: spacing.sm,
  },
  subtitle: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
    marginBottom: spacing.xs,
  },
  hintCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  hintDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  hintText: {
    flex: 1,
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
    lineHeight: 18,
  },
  error: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
  },
  gaugeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  gaugeSegment: {
    flex: 1,
    height: 5,
    borderRadius: 3,
  },
  gaugeLabel: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
    marginLeft: 6,
    minWidth: 64,
    textAlign: "right",
  },
  footer: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
  },
});
