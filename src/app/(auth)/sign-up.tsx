// Inscription v2 (maquette 4f) — 3 étapes ISO maquette :
//   Étape 1 sur 3 « Comment tu t'appelles ? » (prénom → display_name)
//   Étape 2 sur 3 « Tes identifiants » (e-mail pré-rempli depuis la connexion
//   mais modifiable, mot de passe + jauge)
//   Étape 3 sur 3 = code à 6 chiffres (écran verify-otp).
// Header maquette : retour carré + barre de progression + « Étape N sur 3 ».

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
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
import { ONBOARDING_PENDING_KEY } from "@/constants/onboarding-keys";

const TOTAL_STEPS = 3;
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
  const insets = useSafeAreaInsets();
  // E-mail transmis depuis l'écran de connexion (pré-rempli mais modifiable).
  const params = useLocalSearchParams<{ email?: string }>();
  const [step, setStep] = useState<1 | 2>(1);
  const [firstName, setFirstName] = useState("");
  const [isNameFocused, setIsNameFocused] = useState(false);
  const [email, setEmail] = useState(typeof params.email === "string" ? params.email : "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const strength = passwordStrength(password);
  // Jauge maquette : « Correct » = vert accent ; les états plus faibles gardent
  // leurs couleurs sémantiques (rouge / orange), « Solide » = succès.
  const strengthColors = [colors.danger, colors.shiftCp, colors.accent, colors.success];

  function goBack() {
    if (step === 2) {
      setStep(1);
      setError(null);
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/sign-in");
    }
  }

  function handleNameNext() {
    if (!firstName.trim()) {
      setError("Renseigne ton prénom — il sert à retrouver ta ligne.");
      return;
    }
    setError(null);
    setStep(2);
  }

  async function handleSignUp() {
    if (!EMAIL_RE.test(email.trim())) {
      setError("Saisis une adresse e-mail valide.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Au moins ${MIN_PASSWORD_LENGTH} caractères.`);
      return;
    }
    const trimmedEmail = email.trim();
    setIsSubmitting(true);
    setError(null);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      // Le prénom saisi à l'étape 1 alimente le profil dès la création.
      options: { data: { display_name: firstName.trim() } },
    });
    setIsSubmitting(false);
    if (signUpError) {
      Alert.alert("Inscription impossible", authErrorMessage(signUpError));
      return;
    }
    // Anti-énumération Supabase : si l'e-mail est déjà pris, l'API renvoie un
    // utilisateur factice SANS erreur et SANS identité — aucun code ne partira.
    // On renvoie donc vers la connexion au lieu de pousser un écran de code qui
    // attendrait indéfiniment.
    if (data.user && data.user.identities?.length === 0) {
      router.dismissTo({
        pathname: "/sign-in",
        params: {
          email: trimmedEmail,
          notice: "Ce compte existe déjà — connecte-toi.",
        },
      });
      return;
    }
    // Le drapeau « compte neuf » (accueil → « BIENVENUE 1/4 ») n'est posé que
    // lorsque le compte existe VRAIMENT : posé avant la validation du code, une
    // inscription abandonnée le laissait traîner pour le compte suivant créé
    // sur l'appareil.
    if (data.session) {
      // Confirmation e-mail désactivée : session immédiate, pas d'étape 3.
      await AsyncStorage.setItem(ONBOARDING_PENDING_KEY, "1");
      return;
    }
    // Confirmation e-mail activée : pas de session tant que le code n'est pas
    // validé → Étape 3 sur 3 (code à 6 chiffres), qui posera le drapeau.
    router.push({ pathname: "/verify-otp", params: { email: trimmedEmail } });
  }

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: colors.background, paddingTop: Math.max(insets.top, 12) + 4 },
      ]}
    >
      {/* Header maquette : retour carré r11 + progression + « Étape N sur 3 ». */}
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

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step === 1 ? (
            <>
              <View>
                <Text style={[styles.title, { color: colors.text }]}>
                  Comment{"\n"}tu t'appelles ?
                </Text>
                <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                  Ton prénom sert à retrouver ta ligne sur les plannings scannés.
                </Text>
              </View>
              <TextInput
                autoFocus
                autoCapitalize="words"
                autoComplete="given-name"
                textContentType="givenName"
                returnKeyType="next"
                placeholder="Sarah"
                placeholderTextColor={colors.textDisabled}
                value={firstName}
                onChangeText={(value) => {
                  setFirstName(value);
                  setError(null);
                }}
                onFocus={() => setIsNameFocused(true)}
                onBlur={() => setIsNameFocused(false)}
                onSubmitEditing={handleNameNext}
                style={[
                  styles.nameInput,
                  {
                    backgroundColor: colors.surface,
                    borderColor: isNameFocused ? colors.accent : colors.border,
                    color: colors.text,
                  },
                ]}
              />
              {/* Carte verte : variantes du nom (maquette 4f). */}
              <View style={[styles.hintCard, { backgroundColor: colors.accentMuted }]}>
                <View style={[styles.hintDot, { backgroundColor: colors.accent }]} />
                <Text style={[styles.hintText, { color: colors.text }]}>
                  Tu pourras ajouter tes variantes (« MARTIN Sarah », « Sarah M. ») dans Scan &
                  horaires.
                </Text>
              </View>
              {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
              <View style={styles.footer}>
                <Button label="Continuer →" onPress={handleNameNext} />
              </View>
            </>
          ) : (
            <>
              <View>
                <Text style={[styles.title, { color: colors.text }]}>Tes identifiants</Text>
                <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                  Pour retrouver tes plannings sur n'importe quel téléphone.
                </Text>
              </View>
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
              />
              <View>
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
                {/* Jauge de force (maquette : segments + libellé « Correct »). */}
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
                <Button label="Créer mon compte" onPress={handleSignUp} isLoading={isSubmitting} />
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
  nameInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: typeScale.heading,
    fontFamily: fonts.bold,
  },
  hintCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  hintDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  hintText: {
    flex: 1,
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
    lineHeight: 17,
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
  footer: {
    marginTop: "auto",
    paddingTop: spacing.md,
  },
});
