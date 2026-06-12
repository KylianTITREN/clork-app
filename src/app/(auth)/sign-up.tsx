import { Link } from "expo-router";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { spacing, typeScale, useThemeColors } from "@/constants/tokens";
import { supabase } from "@/lib/supabase";

const MIN_PASSWORD_LENGTH = 8;

export default function SignUpScreen() {
  const colors = useThemeColors();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
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
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // Récupéré par le trigger handle_new_user pour créer le profil.
        data: { display_name: displayName.trim() },
      },
    });
    setIsSubmitting(false);
    if (error) {
      Alert.alert("Inscription impossible", error.message);
    }
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Créer un compte</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              Une photo du planning, et ta semaine est dans ton calendrier.
            </Text>
          </View>

          <View style={styles.form}>
            <TextField
              label="Prénom (ou pseudo)"
              autoComplete="name"
              placeholder="Typhanie"
              value={displayName}
              onChangeText={setDisplayName}
            />
            <TextField
              label="Email"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="typhanie@exemple.fr"
              value={email}
              onChangeText={setEmail}
            />
            <TextField
              label="Mot de passe"
              secureTextEntry
              autoComplete="new-password"
              placeholder="8 caractères minimum"
              value={password}
              onChangeText={setPassword}
            />
            <Button label="Créer mon compte" onPress={handleSignUp} isLoading={isSubmitting} />
          </View>

          <Link href="/sign-in" style={[styles.link, { color: colors.accentDeep }]}>
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
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    gap: spacing.xl,
  },
  header: {
    gap: spacing.xs,
  },
  title: {
    fontSize: typeScale.title,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: typeScale.body,
  },
  form: {
    gap: spacing.md,
  },
  link: {
    fontSize: typeScale.body,
    fontWeight: "600",
    textAlign: "center",
  },
});
