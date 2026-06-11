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

export default function SignInScreen() {
  const colors = useThemeColors();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSignIn() {
    if (!email.trim() || !password) {
      Alert.alert("Champs manquants", "Renseigne ton email et ton mot de passe.");
      return;
    }
    setIsSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setIsSubmitting(false);
    if (error) {
      Alert.alert("Connexion impossible", error.message);
    }
    // Succès : l'AuthProvider met à jour la session, le Stack.Protected bascule.
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={[styles.brand, { color: colors.accent }]}>Clork</Text>
            <Text style={[styles.tagline, { color: colors.textMuted }]}>
              Ton planning papier, dans ta poche.
            </Text>
          </View>

          <View style={styles.form}>
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
              autoComplete="password"
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
            />
            <Button label="Se connecter" onPress={handleSignIn} isLoading={isSubmitting} />
          </View>

          <Link href="/sign-up" style={[styles.link, { color: colors.accent }]}>
            Pas encore de compte ? Créer un compte
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
  brand: {
    fontSize: typeScale.hero,
    fontWeight: "800",
    letterSpacing: -1,
  },
  tagline: {
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
