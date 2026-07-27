import { router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { ClorkWordmark } from "@/components/brand/ClorkWordmark";
import { TextField } from "@/components/ui/TextField";
import { fonts, letterSpacing, radius, spacing, typeScale, useThemeColors } from "@/constants/tokens";
import { authErrorMessage } from "@/lib/auth-errors";
import { supabase } from "@/lib/supabase";

// Validation locale légère : on bloque les fautes de frappe évidentes avant
// d'enchaîner sur le mot de passe.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Connexion en deux temps : email d'abord, puis mot de passe. On NE teste
 * jamais l'existence du compte (pas d'énumération) : si la connexion échoue,
 * on propose simplement de créer un compte avec l'email déjà saisi.
 */
export default function SignInScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedEmail = email.trim();

  function goToPassword() {
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError("Email invalide. Vérifie le format (ex. prenom@mail.fr).");
      return;
    }
    setError(null);
    setStep("password");
  }

  async function handleSignIn() {
    if (!password) {
      setError("Renseigne ton mot de passe.");
      return;
    }
    setIsSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });
    setIsSubmitting(false);
    if (signInError) {
      setError(authErrorMessage(signInError));
    }
    // Succès : l'AuthProvider met à jour la session, le Stack.Protected bascule.
  }

  function goToSignUp() {
    router.push({ pathname: "/sign-up", params: { email: trimmedEmail } });
  }

  async function continueAsGuest() {
    const { error: guestError } = await supabase.auth.signInAnonymously();
    if (guestError) Alert.alert("Oups", authErrorMessage(guestError));
  }

  return (
    <SafeAreaView edges={[]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        {step === "email" ? (
          <View style={styles.flex}>
            {/* Hero sombre FERRÉ EN HAUT, pleine largeur, arrondi bas seul —
                wordmark SEUL (spec 4g, la marge blanche de la maquette est une
                erreur signalée par Kylian). */}
            <View style={[styles.hero, { backgroundColor: colors.ink, paddingTop: insets.top + 44 }]}>
              <ClorkWordmark size={38} color={colors.onInk} dial={colors.accent} background={colors.ink} />
              <Text style={[styles.tagline, { color: colors.onInk, opacity: 0.6 }]}>
                Ton planning papier, dans ta poche.
              </Text>
            </View>

            <View style={styles.form}>
              <TextField
                label="Email"
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
                onSubmitEditing={goToPassword}
              />
              {error ? (
                <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
              ) : null}
              <Button label="Continuer →" onPress={goToPassword} />
            </View>

            {/* « Essayer sans compte » + note : FERRÉS EN BAS (maquette 4f). */}
            <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
              <Button label="Essayer sans compte" variant="secondary" onPress={continueAsGuest} />
              <Text style={[styles.guestHint, { color: colors.textMuted }]}>
                Mode essai : 1 scan/semaine, sans partage.{"\n"}
                Tu crées ton compte plus tard, sans rien perdre.
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.content}>
            <Text style={[styles.welcomeBack, { color: colors.text }]}>Content de te revoir</Text>
            <View style={styles.form}>
              <Pressable
                onPress={() => {
                  setStep("email");
                  setError(null);
                }}
                style={[styles.emailRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={styles.emailRowText}>
                  <Text style={[styles.emailRowLabel, { color: colors.textMuted }]}>EMAIL</Text>
                  <Text style={[styles.emailRowValue, { color: colors.text }]} numberOfLines={1}>
                    {trimmedEmail}
                  </Text>
                </View>
                <Text style={[styles.emailRowAction, { color: colors.accent }]}>Modifier</Text>
              </Pressable>

              <TextField
                label="Mot de passe"
                autoFocus
                secureToggle
                autoComplete="password"
                textContentType="password"
                returnKeyType="go"
                placeholder="••••••••"
                value={password}
                onChangeText={(value) => {
                  setPassword(value);
                  setError(null);
                }}
                onSubmitEditing={handleSignIn}
              />
              {error ? (
                <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
              ) : null}
              <Button label="Se connecter" onPress={handleSignIn} isLoading={isSubmitting} />

              <Pressable onPress={goToSignUp} style={styles.signUpLink}>
                <Text style={[styles.link, { color: colors.accent }]}>
                  Pas encore de compte ? Créer un compte
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: 84,
    gap: spacing.lg,
  },
  hero: {
    alignItems: "center",
    gap: spacing.sm + 2,
    paddingBottom: 40,
    paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: radius.hero,
    borderBottomRightRadius: radius.hero,
  },
  form: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  footer: {
    marginTop: "auto",
    paddingHorizontal: spacing.lg,
    gap: spacing.sm + 2,
  },
  guestHint: {
    fontSize: typeScale.caption,
    fontFamily: fonts.regular,
    textAlign: "center",
    lineHeight: 18,
  },
  header: {
    gap: spacing.sm + 2,
    alignItems: "center",
    borderRadius: radius.hero,
    paddingVertical: spacing.xl + 8,
    paddingHorizontal: spacing.lg,
  },
  welcomeBack: {
    fontSize: typeScale.title,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.title,
    textAlign: "center",
  },
  tagline: {
    fontSize: typeScale.body,
    fontFamily: fonts.regular,
    textAlign: "center",
  },
  error: {
    fontSize: typeScale.caption,
    fontFamily: fonts.bold,
    marginTop: -spacing.xs,
  },
  emailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  emailRowText: {
    flex: 1,
    gap: 1,
  },
  emailRowLabel: {
    fontSize: typeScale.caption,
    fontFamily: fonts.bold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  emailRowValue: {
    fontSize: typeScale.body,
    fontFamily: fonts.bold,
  },
  emailRowAction: {
    fontSize: typeScale.caption,
    fontFamily: fonts.extraBold,
  },
  signUpLink: {
    alignItems: "center",
  },
  link: {
    fontSize: typeScale.body,
    fontFamily: fonts.bold,
    textAlign: "center",
  },
});
