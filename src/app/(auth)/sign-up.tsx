// Inscription v2 (maquette 4f) — 3 étapes avec barre de progression :
//   1/3 email · 2/3 mot de passe (jauge de force) · 3/3 code 6 chiffres
//   (écran verify-otp). Le prénom n'est plus demandé ici : il arrive dans
//   l'onboarding post-inscription (il alimente le matching du scan).

import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
  spacing,
  typeScale,
  useThemeColors,
} from "@/constants/tokens";
import { authErrorMessage } from "@/lib/auth-errors";
import { supabase } from "@/lib/supabase";

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Force du mot de passe 0-3 : longueur, mélange de casses/chiffres, longueur+. */
function passwordStrength(password: string): number {
  let score = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password) || /[^a-zA-Z0-9]/.test(password)) score += 1;
  return score;
}

const STRENGTH_LABELS = ["Trop court", "Fragile", "Correct", "Solide"] as const;

export default function SignUpScreen() {
  const colors = useThemeColors();
  // Email transmis depuis l'écran de connexion (pré-rempli).
  const params = useLocalSearchParams<{ email?: string }>();
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState(typeof params.email === "string" ? params.email : "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const strength = passwordStrength(password);
  const strengthColors = [colors.danger, colors.shiftCp, colors.accentSoft, colors.success];

  function handleEmailNext() {
    if (!EMAIL_RE.test(email.trim())) {
      setError("Saisis une adresse e-mail valide.");
      return;
    }
    setError(null);
    setStep(2);
  }

  async function handleSignUp() {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Au moins ${MIN_PASSWORD_LENGTH} caractères.`);
      return;
    }
    setIsSubmitting(true);
    setError(null);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      // Le prénom est renseigné à l'onboarding (le trigger tolère l'absence).
      options: { data: { display_name: "" } },
    });
    setIsSubmitting(false);
    if (signUpError) {
      Alert.alert("Inscription impossible", authErrorMessage(signUpError));
      return;
    }
    // Confirmation e-mail activée : pas de session tant que le code n'est pas
    // validé → étape 3/3 (code à 6 chiffres).
    if (!data.session) {
      router.push({ pathname: "/verify-otp", params: { email: email.trim() } });
    }
  }

  return (
    <WizardFrame
      step={step}
      totalSteps={3}
      closeIcon="back"
      onClose={() => {
        if (step === 2) setStep(1);
        else if (router.canGoBack()) router.back();
        else router.replace("/sign-in");
      }}
    >
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step === 1 ? (
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
                returnKeyType="next"
                placeholder="sarah@exemple.fr"
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  setError(null);
                }}
                onSubmitEditing={handleEmailNext}
              />
              {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
              <Button label="Continuer →" onPress={handleEmailNext} />
              <Pressable onPress={() => router.replace("/sign-in")} hitSlop={8}>
                <Text style={[styles.link, { color: colors.accent }]}>
                  Déjà un compte ? Se connecter
                </Text>
              </Pressable>
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
              {/* Jauge de force */}
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
              <Button label="Créer mon compte" onPress={handleSignUp} isLoading={isSubmitting} />
            </>
          )}
        </ScrollView>
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
  error: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
  },
  link: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.bold,
    textAlign: "center",
    paddingVertical: spacing.sm,
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
});
