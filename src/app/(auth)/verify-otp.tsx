import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
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

const CODE_LENGTH = 6;

export default function VerifyOtpScreen() {
  const colors = useThemeColors();
  const { themeId } = useTheme();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = typeof params.email === "string" ? params.email : "";
  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);

  async function handleVerify() {
    if (code.trim().length !== CODE_LENGTH) {
      Alert.alert("Code incomplet", `Saisis le code à ${CODE_LENGTH} chiffres reçu par e-mail.`);
      return;
    }
    setIsVerifying(true);
    // Succès : une session est créée → l'AuthProvider bascule vers l'app.
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "signup",
    });
    setIsVerifying(false);
    if (error) {
      Alert.alert("Code invalide", authErrorMessage(error));
    }
  }

  async function handleResend() {
    setIsResending(true);
    const { error } = await supabase.auth.resend({ type: "signup", email });
    setIsResending(false);
    Alert.alert(
      error ? "Envoi impossible" : "Code renvoyé",
      error ? authErrorMessage(error) : `Un nouveau code a été envoyé à ${email}.`,
    );
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
            <Text style={[styles.title, { color: colors.text }]}>Vérifie ton e-mail</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              On t'a envoyé un code à {CODE_LENGTH} chiffres à {email || "ton adresse"}. Saisis-le
              ci-dessous pour activer ton compte.
            </Text>
          </View>

          <View style={styles.form}>
            <TextField
              label="Code de vérification"
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={CODE_LENGTH}
              placeholder="123456"
              value={code}
              onChangeText={(value) => setCode(value.replace(/[^0-9]/g, ""))}
            />
            <Button label="Valider" onPress={handleVerify} isLoading={isVerifying} />
          </View>

          <Pressable onPress={handleResend} disabled={isResending} hitSlop={8}>
            <Text style={[styles.resend, { color: colors.accent }]}>
              {isResending ? "Envoi…" : "Renvoyer le code"}
            </Text>
          </Pressable>
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
  resend: {
    fontSize: typeScale.body,
    fontFamily: fonts.bold,
    textAlign: "center",
  },
});
