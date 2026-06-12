import { Link } from "expo-router";
import { Image } from "react-native";
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
import { fonts, spacing, typeScale, useThemeColors } from "@/constants/tokens";
import { logoByTheme } from "@/constants/logo-assets";
import { authErrorMessage } from "@/lib/auth-errors";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/providers/theme-provider";

export default function SignInScreen() {
  const colors = useThemeColors();
  const { themeId } = useTheme();
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
      Alert.alert("Connexion impossible", authErrorMessage(error));
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
            <Image source={logoByTheme[themeId]} style={styles.logo} />
            <Text style={[styles.brand, { color: colors.text }]}>Clork</Text>
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
              placeholder="capucine@exemple.fr"
              value={email}
              onChangeText={setEmail}
            />
            <TextField
              label="Mot de passe"
              secureToggle
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

          <Button
            label="Essayer sans compte"
            variant="ghost"
            onPress={async () => {
              const { error } = await supabase.auth.signInAnonymously();
              if (error) Alert.alert("Oups", authErrorMessage(error));
            }}
          />
          <Text style={[styles.guestHint, { color: colors.textMuted }]}>
            Mode essai : 1 scan par semaine, sans partage. Tu pourras créer ton
            compte plus tard sans rien perdre.
          </Text>
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
