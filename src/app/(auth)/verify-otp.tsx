// Vérification e-mail v2 (maquette 4f, « Étape 3 sur 3 ») : code à 6 chiffres
// saisi dans 6 cases (un seul TextInput invisible pilote l'ensemble),
// « Renvoyer le code » sous les cases, CTA « Valider » gris tant que le code
// est incomplet + caption « Le bouton s'active quand les 6 chiffres sont
// saisis. » ferrés en bas.

import { Ionicons } from "@expo/vector-icons";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
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

const TOTAL_STEPS = 3;
const CODE_LENGTH = 6;

export default function VerifyOtpScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
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
    // Succès : la session apparaît, le RootStack bascule sur (tabs) et
    // l'accueil ouvre l'onboarding via ONBOARDING_PENDING_KEY — pas de
    // navigation d'ici, elle serait avalée par le changement de pile.
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
    <View
      style={[
        styles.screen,
        { backgroundColor: colors.background, paddingTop: Math.max(insets.top, 12) + 4 },
      ]}
    >
      {/* Header maquette : retour carré r11 + progression 100 % + « Étape 3 sur 3 ». */}
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Retour"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/sign-in"))}
          hitSlop={10}
          style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <View style={[styles.progressRail, { backgroundColor: colors.surfaceMuted }]}>
          <View style={[styles.progressFill, { backgroundColor: colors.accent, width: "100%" }]} />
        </View>
        <Text style={[styles.stepLabel, { color: colors.accent }]}>
          Étape {TOTAL_STEPS} sur {TOTAL_STEPS}
        </Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <View style={styles.content}>
          <View>
            <Text style={[styles.title, { color: colors.text }]}>Vérifie ton e-mail</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              Code à {CODE_LENGTH} chiffres envoyé à{" "}
              <Text style={[styles.subtitleEmail, { color: colors.text }]}>
                {email || "ton adresse"}
              </Text>
            </Text>
          </View>

          {/* 6 cases visuelles pilotées par un input invisible ; seule la case
              active est bordée en vert (maquette). */}
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
                      borderColor: isActive ? colors.accent : colors.border,
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

          <Pressable onPress={handleResend} disabled={isResending} hitSlop={8}>
            <Text style={[styles.resend, { color: colors.accent }]}>
              {isResending ? "Envoi…" : "Renvoyer le code"}
            </Text>
          </Pressable>

          {/* CTA + caption ferrés en bas (maquette 4f). */}
          <View style={styles.footer}>
            <Button
              label="Valider"
              onPress={handleVerify}
              isLoading={isVerifying}
              disabled={!isComplete}
            />
            <Text style={[styles.footerCaption, { color: colors.textDisabled }]}>
              Le bouton s'active quand les 6 chiffres sont saisis.
            </Text>
          </View>
        </View>
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
    flex: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontSize: typeScale.title,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.title,
  },
  subtitle: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
    marginTop: 5,
  },
  subtitleEmail: {
    fontFamily: fonts.semiBold,
  },
  cells: {
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  cell: {
    width: 44,
    height: 54,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cellDigit: {
    fontSize: typeScale.heading,
    fontFamily: fonts.bold,
  },
  hiddenInput: {
    position: "absolute",
    opacity: 0,
    height: 1,
    width: 1,
  },
  resend: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
    textAlign: "center",
    paddingVertical: spacing.xs,
  },
  footer: {
    marginTop: "auto",
    gap: spacing.sm,
  },
  footerCaption: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.medium,
    textAlign: "center",
  },
});
