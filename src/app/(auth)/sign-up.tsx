import { Ionicons } from "@expo/vector-icons";
import { Link, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Image,
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
import { logoByTheme } from "@/constants/logo-assets";
import { fonts, spacing, typeScale, useThemeColors } from "@/constants/tokens";
import { authErrorMessage } from "@/lib/auth-errors";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/providers/theme-provider";

const MIN_PASSWORD_LENGTH = 8;

export default function SignUpScreen() {
  const colors = useThemeColors();
  const { themeId } = useTheme();
  // Email transmis depuis l'écran de connexion (« Créer un compte » pré-rempli).
  const params = useLocalSearchParams<{ email?: string }>();
  const prefilledEmail = typeof params.email === "string" ? params.email : "";
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState(prefilledEmail);
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSignUp() {
    if (!displayName.trim() || !email.trim() || !password) {
      Alert.alert("Champs manquants", "Tous les champs sont obligatoires.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      Alert.alert(
        "Mot de passe trop court",
        `Au moins ${MIN_PASSWORD_LENGTH} caractères.`,
      );
      return;
    }
    setIsSubmitting(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // Récupéré par le trigger handle_new_user pour créer le profil.
        data: { display_name: displayName.trim() },
      },
    });
    setIsSubmitting(false);
    if (error) {
      Alert.alert("Inscription impossible", authErrorMessage(error));
      return;
    }
    // Confirmation e-mail activée : pas de session tant que le code n'est pas
    // validé → direction l'écran de vérification (code OTP à 6 chiffres).
    if (!data.session) {
      router.push({ pathname: "/verify-otp", params: { email: email.trim() } });
    }
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/sign-in"))}
          hitSlop={12}
          accessibilityLabel="Retour"
          style={[styles.backButton, { backgroundColor: colors.surface }]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.content}>
          <View style={styles.header}>
            <Image source={logoByTheme[themeId]} style={styles.logo} />
            <Text style={[styles.title, { color: colors.text }]}>Créer un compte</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              Une photo du planning, et ta semaine est dans ton calendrier.
            </Text>
          </View>

          <View style={styles.form}>
            <TextField
              label="Prénom (ou pseudo)"
              autoFocus
              autoComplete="name"
              textContentType="givenName"
              placeholder="Capucine"
              value={displayName}
              onChangeText={setDisplayName}
            />
            <TextField
              label="Email"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              keyboardType="email-address"
              placeholder="capucine@exemple.fr"
              value={email}
              onChangeText={setEmail}
            />
            <TextField
              label="Mot de passe"
              secureToggle
              autoComplete="new-password"
              textContentType="newPassword"
              placeholder="8 caractères minimum"
              value={password}
              onChangeText={setPassword}
            />
            <Button label="Créer mon compte" onPress={handleSignUp} isLoading={isSubmitting} />
          </View>

          <Link href="/sign-in" style={[styles.link, { color: colors.accent }]}>
            Déjà un compte ? Se connecter
          </Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  backButton: {
    position: "absolute",
    top: spacing.sm,
    left: spacing.lg,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
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
    width: 84,
    height: 84,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: typeScale.title,
    fontFamily: fonts.black,
  },
  subtitle: {
    fontSize: typeScale.body,
    fontFamily: fonts.regular,
    textAlign: "center",
  },
  form: {
    gap: spacing.md,
  },
  link: {
    fontSize: typeScale.body,
    fontFamily: fonts.bold,
    textAlign: "center",
  },
});
