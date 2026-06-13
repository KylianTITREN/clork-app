import { router } from "expo-router";
import { Image } from "react-native";
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
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { fonts, radius, spacing, typeScale, useThemeColors } from "@/constants/tokens";
import { logoByTheme } from "@/constants/logo-assets";
import { authErrorMessage } from "@/lib/auth-errors";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/providers/theme-provider";

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
  const { themeId } = useTheme();
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
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Image source={logoByTheme[themeId]} style={styles.logo} />
            <Text style={[styles.brand, { color: colors.text }]}>Clork</Text>
            <Text style={[styles.tagline, { color: colors.textMuted }]}>
              Ton planning papier, dans ta poche.
            </Text>
          </View>

          {step === "email" ? (
            <>
              <View style={styles.form}>
                <TextField
                  label="Email"
                  autoFocus
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                  keyboardType="email-address"
                  returnKeyType="next"
                  placeholder="capucine@exemple.fr"
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
                <Button label="Continuer" onPress={goToPassword} />
              </View>

              <View style={styles.footer}>
                <Button label="Essayer sans compte" variant="ghost" onPress={continueAsGuest} />
                <Text style={[styles.guestHint, { color: colors.textMuted }]}>
                  Mode essai : 1 scan par semaine, sans partage. Tu pourras créer ton
                  compte plus tard sans rien perdre.
                </Text>
              </View>
            </>
          ) : (
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
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    gap: spacing.xl,
  },
  header: {
    gap: spacing.xs,
    alignItems: "center",
  },
  logo: {
    width: 110,
    height: 110,
    marginBottom: spacing.sm,
  },
  brand: {
    fontSize: typeScale.hero,
    fontFamily: fonts.black,
    letterSpacing: -1,
  },
  tagline: {
    fontSize: typeScale.body,
    fontFamily: fonts.regular,
    textAlign: "center",
  },
  form: {
    gap: spacing.md,
  },
  footer: {
    gap: spacing.xs,
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
  guestHint: {
    fontSize: typeScale.caption,
    fontFamily: fonts.regular,
    textAlign: "center",
    lineHeight: 18,
  },
});
