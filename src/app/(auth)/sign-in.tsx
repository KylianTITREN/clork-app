// Connexion « e-mail d'abord » v2 (maquette 4f) :
//   écran 1 = hero encre + champ e-mail seul + « Continuer → » ;
//   e-mail CONNU (rpc email_is_registered) → état 2 « Content de te revoir »
//   (e-mail affiché + Modifier, mot de passe, « Se connecter ») ;
//   e-mail INCONNU → inscription directe avec l'e-mail en paramètre.
// En cas d'erreur réseau sur le RPC, on replie sur l'écran mot de passe —
// on ne bloque jamais la connexion.

import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
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
// d'interroger le serveur.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignInScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  // Paramètres posés par l'inscription quand elle repart d'où elle vient
  // (compte déjà existant) : e-mail à pré-remplir + raison du renvoi.
  const params = useLocalSearchParams<{ email?: string; notice?: string }>();
  const paramEmail = typeof params.email === "string" ? params.email : "";
  const paramNotice = typeof params.notice === "string" ? params.notice : "";
  const [step, setStep] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const trimmedEmail = email.trim();

  // Renvoi depuis l'inscription : on ré-ouvre « Content de te revoir » avec
  // l'e-mail concerné plutôt que de rejeter la personne à l'écran vide.
  useEffect(() => {
    if (!paramEmail) return;
    setEmail(paramEmail);
    setStep("password");
    setNotice(paramNotice || null);
  }, [paramEmail, paramNotice]);

  async function handleContinue() {
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError("Email invalide. Vérifie le format (ex. prenom@mail.fr).");
      return;
    }
    setError(null);
    setIsChecking(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("email_is_registered", {
        p_email: trimmedEmail,
      });
      if (rpcError) throw rpcError;
      if (data === true) {
        // Compte existant → « Content de te revoir ».
        setStep("password");
      } else {
        // E-mail inconnu → inscription directe, étape « Comment tu t'appelles ? ».
        router.push({ pathname: "/sign-up", params: { email: trimmedEmail } });
      }
    } catch {
      // Erreur réseau : on ne bloque jamais — repli sur l'écran mot de passe.
      setStep("password");
    } finally {
      setIsChecking(false);
    }
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

  function backToEmail() {
    setStep("email");
    setPassword("");
    setError(null);
    setNotice(null);
  }

  function goToSignUp() {
    router.push({ pathname: "/sign-up", params: { email: trimmedEmail } });
  }

  function goToForgotPassword() {
    // Route hors types générés tant que le serveur de dev n'a pas re-tourné.
    router.push({
      pathname: "/forgot-password",
      params: { email: trimmedEmail },
    } as Parameters<typeof router.push>[0]);
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

            {/* Champ e-mail + bouton CENTRÉS entre hero et pied (préférence
                Kylian, assumée contre la maquette qui les ancrait en haut). */}
            <View style={[styles.form, styles.formCentered]}>
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
                onSubmitEditing={handleContinue}
              />
              {error ? (
                <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
              ) : null}
              <Button label="Continuer →" onPress={handleContinue} isLoading={isChecking} />
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
          <View style={[styles.content, { paddingTop: insets.top + 12 }]}>
            {/* Retour carré + titre (maquette 4f, écran « Content de te revoir »). */}
            <View style={styles.header}>
              <Pressable
                accessibilityLabel="Retour"
                onPress={backToEmail}
                hitSlop={10}
                style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Ionicons name="chevron-back" size={20} color={colors.text} />
              </Pressable>
              <Text style={[styles.welcomeBack, { color: colors.text }]}>Content de te revoir</Text>
            </View>

            <View style={styles.form}>
              {notice ? (
                <View style={[styles.noticeCard, { backgroundColor: colors.accentMuted }]}>
                  <View style={[styles.noticeDot, { backgroundColor: colors.accent }]} />
                  <Text style={[styles.noticeText, { color: colors.text }]}>{notice}</Text>
                </View>
              ) : null}

              <Pressable
                onPress={backToEmail}
                style={[styles.emailRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={styles.emailRowText}>
                  <Text style={[styles.emailRowLabel, { color: colors.textMuted }]}>Email</Text>
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
              {/* Seule sortie quand le mot de passe est perdu : le parcours
                  « e-mail d'abord » ne laisse aucune autre issue. */}
              <Pressable onPress={goToForgotPassword} hitSlop={8} style={styles.forgotLink}>
                <Text style={[styles.link, { color: colors.accent }]}>Mot de passe oublié ?</Text>
              </Pressable>
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
    gap: spacing.sm + 4,
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
    paddingTop: 22,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm + 4,
  },
  formCentered: {
    flex: 1,
    justifyContent: "center",
    paddingTop: 0,
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
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 4,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: radius.input,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  welcomeBack: {
    flex: 1,
    fontSize: typeScale.heading,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.heading,
  },
  tagline: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
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
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  emailRowText: {
    flex: 1,
    gap: 1,
  },
  emailRowLabel: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  emailRowValue: {
    fontSize: typeScale.body,
    fontFamily: fonts.semiBold,
  },
  emailRowAction: {
    fontSize: typeScale.caption,
    fontFamily: fonts.bold,
  },
  forgotLink: {
    alignSelf: "flex-end",
    marginTop: -spacing.xs,
    paddingVertical: spacing.xs,
  },
  signUpLink: {
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  // Bandeau d'information (compte déjà existant) : langage des cartes vertes
  // de l'inscription, pas le rouge des erreurs de saisie.
  noticeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  noticeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  noticeText: {
    flex: 1,
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
    lineHeight: 17,
  },
  link: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
    textAlign: "center",
  },
});
