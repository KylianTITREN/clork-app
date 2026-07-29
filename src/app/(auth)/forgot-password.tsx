// Mot de passe oublié v2 — chemin manquant du parcours « e-mail d'abord » :
// sans lui, une personne qui a perdu son mot de passe n'a AUCUNE sortie depuis
// « Content de te revoir ». Gabarit visuel ISO inscription (en-tête à
// progression, jauge de force, cases à 6 chiffres) : c'est un chemin manquant,
// pas une nouvelle direction de design.
//
// 3 étapes :
//   1/3 e-mail        → resetPasswordForEmail (code à 6 chiffres par e-mail)
//   2/3 nouveau mot de passe
//   3/3 code          → verifyOtp('recovery') PUIS updateUser({ password })
//
// Le mot de passe est demandé AVANT le code : verifyOtp ouvre une session, et
// la pile (auth) est démontée dès que la session existe (Stack.Protected) —
// un écran posé après la vérification serait emporté avant d'être utilisable.
//
// Côté Supabase, le modèle d'e-mail « Reset password » doit exposer
// {{ .Token }} : c'est ce code que l'écran attend.

import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
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

const TOTAL_STEPS = 3;
const CODE_LENGTH = 6;
const MIN_PASSWORD_LENGTH = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Force du mot de passe 0-3 — même barème que l'inscription. */
function passwordStrength(password: string): number {
  let score = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password) || /[^a-zA-Z0-9]/.test(password)) score += 1;
  return score;
}

const STRENGTH_LABELS = ["Trop court", "Fragile", "Correct", "Solide"] as const;

export default function ForgotPasswordScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  // E-mail transmis par « Content de te revoir » : il est déjà saisi, on ne
  // le redemande pas à l'aveugle (mais il reste modifiable).
  const params = useLocalSearchParams<{ email?: string }>();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState(typeof params.email === "string" ? params.email : "");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const codeInputRef = useRef<TextInput>(null);

  const trimmedEmail = email.trim();
  const strength = passwordStrength(password);
  // Jauge : « Correct » = accent du thème, les états faibles gardent leur
  // couleur sémantique (rouge / orange), « Solide » = succès.
  const strengthColors = [colors.danger, colors.shiftCp, colors.accent, colors.success];
  const isCodeComplete = code.length === CODE_LENGTH;

  function goBack() {
    if (step > 1) {
      setStep((current) => (current - 1) as 1 | 2);
      setError(null);
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace("/sign-in");
  }

  async function handleSendCode() {
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError("Email invalide. Vérifie le format (ex. prenom@mail.fr).");
      return;
    }
    setError(null);
    setIsSending(true);
    const { error: sendError } = await supabase.auth.resetPasswordForEmail(trimmedEmail);
    setIsSending(false);
    if (sendError) {
      setError(authErrorMessage(sendError));
      return;
    }
    setStep(2);
  }

  function handlePasswordNext() {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Au moins ${MIN_PASSWORD_LENGTH} caractères.`);
      return;
    }
    setError(null);
    setStep(3);
  }

  async function handleResend() {
    setIsResending(true);
    const { error: resendError } = await supabase.auth.resetPasswordForEmail(trimmedEmail);
    setIsResending(false);
    Alert.alert(
      resendError ? "Envoi impossible" : "Code renvoyé",
      resendError
        ? authErrorMessage(resendError)
        : `Un nouveau code a été envoyé à ${trimmedEmail}.`,
    );
  }

  async function handleValidate() {
    if (!isCodeComplete) return;
    setIsSubmitting(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: trimmedEmail,
      token: code,
      type: "recovery",
    });
    if (verifyError) {
      setIsSubmitting(false);
      Alert.alert("Code invalide", authErrorMessage(verifyError));
      return;
    }
    // La session est ouverte : l'app bascule déjà sur (tabs). La mise à jour
    // continue quand même — la promesse n'est pas liée au montage de l'écran.
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setIsSubmitting(false);
    Alert.alert(
      updateError ? "Mot de passe non modifié" : "Mot de passe mis à jour",
      updateError
        ? `${authErrorMessage(updateError)} Tu es connecté·e : tu peux le changer dans Profil → Compte.`
        : "Tu es connecté·e avec ton nouveau mot de passe.",
    );
  }

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: colors.background, paddingTop: Math.max(insets.top, 12) + 4 },
      ]}
    >
      {/* En-tête commun aux parcours auth : retour carré + progression. */}
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Retour"
          onPress={goBack}
          hitSlop={10}
          style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <View style={[styles.progressRail, { backgroundColor: colors.surfaceMuted }]}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: colors.accent, width: `${(step / TOTAL_STEPS) * 100}%` },
            ]}
          />
        </View>
        <Text style={[styles.stepLabel, { color: colors.accent }]}>
          Étape {step} sur {TOTAL_STEPS}
        </Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step === 1 ? (
            <>
              <View>
                <Text style={[styles.title, { color: colors.text }]}>
                  Mot de passe{"\n"}oublié ?
                </Text>
                <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                  On t'envoie un code à {CODE_LENGTH} chiffres pour en choisir un nouveau.
                </Text>
              </View>
              <TextField
                label="Email"
                autoFocus
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                keyboardType="email-address"
                returnKeyType="send"
                placeholder="sarah@exemple.fr"
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  setError(null);
                }}
                onSubmitEditing={handleSendCode}
              />
              {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
              <View style={styles.footer}>
                <Button label="Recevoir un code" onPress={handleSendCode} isLoading={isSending} />
              </View>
            </>
          ) : step === 2 ? (
            <>
              <View>
                <Text style={[styles.title, { color: colors.text }]}>
                  Ton nouveau{"\n"}mot de passe
                </Text>
                <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                  {MIN_PASSWORD_LENGTH} caractères minimum — il sera appliqué dès que le code sera
                  validé.
                </Text>
              </View>
              <View>
                <TextField
                  label="Nouveau mot de passe"
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
                  onSubmitEditing={handlePasswordNext}
                />
                {/* Jauge de force — barème et libellés de l'inscription. */}
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
                  <Text
                    style={[
                      styles.gaugeLabel,
                      { color: password.length > 0 ? strengthColors[strength] : colors.textMuted },
                    ]}
                  >
                    {password.length > 0 ? STRENGTH_LABELS[strength] : " "}
                  </Text>
                </View>
              </View>
              {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
              <View style={styles.footer}>
                <Button label="Continuer →" onPress={handlePasswordNext} />
              </View>
            </>
          ) : (
            <>
              <View>
                <Text style={[styles.title, { color: colors.text }]}>Vérifie ton e-mail</Text>
                <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                  Code à {CODE_LENGTH} chiffres envoyé à{" "}
                  <Text style={[styles.subtitleEmail, { color: colors.text }]}>{trimmedEmail}</Text>
                </Text>
              </View>

              {/* Mêmes cases que l'inscription : un input invisible pilote les 6. */}
              <Pressable onPress={() => codeInputRef.current?.focus()} style={styles.cells}>
                {Array.from({ length: CODE_LENGTH }, (_, index) => {
                  const digit = code[index] ?? "";
                  const isActive = index === code.length;
                  return (
                    <View
                      key={index}
                      style={[
                        styles.cell,
                        {
                          backgroundColor: colors.surface,
                          borderColor: isActive ? colors.accent : colors.border,
                        },
                      ]}
                    >
                      <Text style={[styles.cellDigit, { color: colors.text }]}>{digit}</Text>
                    </View>
                  );
                })}
              </Pressable>
              <TextInput
                ref={codeInputRef}
                value={code}
                onChangeText={(value) => setCode(value.replace(/[^0-9]/g, "").slice(0, CODE_LENGTH))}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                autoFocus
                style={styles.hiddenInput}
              />

              <Pressable onPress={handleResend} disabled={isResending} hitSlop={8}>
                <Text style={[styles.resend, { color: colors.accent }]}>
                  {isResending ? "Envoi…" : "Renvoyer le code"}
                </Text>
              </Pressable>

              <View style={styles.footer}>
                <Button
                  label="Valider"
                  onPress={handleValidate}
                  isLoading={isSubmitting}
                  disabled={!isCodeComplete}
                />
                <Text style={[styles.footerCaption, { color: colors.textDisabled }]}>
                  Le bouton s'active quand les {CODE_LENGTH} chiffres sont saisis.
                </Text>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
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
    paddingVertical: spacing.sm,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: radius.input,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  progressRail: {
    flex: 1,
    height: 5,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: radius.pill,
  },
  stepLabel: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
  },
  content: {
    flexGrow: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontSize: typeScale.title,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.title,
    lineHeight: 30,
  },
  subtitle: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
    marginTop: 5,
  },
  subtitleEmail: {
    fontFamily: fonts.semiBold,
  },
  error: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
  },
  gaugeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: spacing.sm,
  },
  gaugeSegment: {
    flex: 1,
    height: 5,
    borderRadius: radius.pill,
  },
  gaugeLabel: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
    marginLeft: 6,
    minWidth: 64,
    textAlign: "right",
  },
  cells: {
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  cell: {
    width: 44,
    height: 54,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cellDigit: {
    fontSize: typeScale.heading,
    fontFamily: fonts.bold,
  },
  hiddenInput: {
    position: "absolute",
    opacity: 0,
    height: 1,
    width: 1,
  },
  resend: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
    textAlign: "center",
    paddingVertical: spacing.xs,
  },
  footer: {
    marginTop: "auto",
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  footerCaption: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.medium,
    textAlign: "center",
  },
});
