// Vérification e-mail v2 (maquette 4f, étape 3/3) : code à 6 chiffres saisi
// dans 6 cases (un seul TextInput invisible pilote l'ensemble), « Renvoyer le
// code », CTA actif uniquement quand le code est complet.

import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Button } from "@/components/ui/Button";
import { WizardFrame } from "@/components/ui/WizardFrame";
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

const CODE_LENGTH = 6;

export default function VerifyOtpScreen() {
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = typeof params.email === "string" ? params.email : "";
  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const isComplete = code.length === CODE_LENGTH;

  async function handleVerify() {
    if (!isComplete) return;
    setIsVerifying(true);
    // Succès : une session est créée → l'AuthProvider bascule vers l'app.
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
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
    <WizardFrame
      step={3}
      totalSteps={3}
      closeIcon="back"
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/sign-in"))}
    >
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <View style={styles.content}>
          <Text style={[styles.title, { color: colors.text }]}>Vérifie ton e-mail</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            On t'a envoyé un code à {CODE_LENGTH} chiffres à {email || "ton adresse"}.
          </Text>

          {/* 6 cases visuelles pilotées par un input invisible. */}
          <Pressable onPress={() => inputRef.current?.focus()} style={styles.cells}>
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
                      borderColor: isActive ? colors.accent : digit ? colors.text : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.cellDigit, { color: colors.text }]}>{digit}</Text>
                </View>
              );
            })}
          </Pressable>
          <TextInput
            ref={inputRef}
            value={code}
            onChangeText={(value) => setCode(value.replace(/[^0-9]/g, "").slice(0, CODE_LENGTH))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            autoFocus
            style={styles.hiddenInput}
          />

          <Button
            label="Valider"
            onPress={handleVerify}
            isLoading={isVerifying}
            disabled={!isComplete}
          />
          <Pressable onPress={handleResend} disabled={isResending} hitSlop={8}>
            <Text style={[styles.resend, { color: colors.accent }]}>
              {isResending ? "Envoi…" : "Renvoyer le code"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </WizardFrame>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontSize: typeScale.title,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.title,
    marginTop: spacing.sm,
  },
  subtitle: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
  },
  cells: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginVertical: spacing.sm,
  },
  cell: {
    width: 48,
    height: 56,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  cellDigit: {
    fontSize: typeScale.title,
    fontFamily: fonts.bold,
  },
  hiddenInput: {
    position: "absolute",
    opacity: 0,
    height: 1,
    width: 1,
  },
  resend: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.bold,
    textAlign: "center",
    paddingVertical: spacing.sm,
  },
});
