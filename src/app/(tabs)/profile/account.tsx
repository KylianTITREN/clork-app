import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Section } from "@/components/profile/Section";
import { SubPageHeader } from "@/components/profile/SubPageHeader";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { fonts, radius, spacing, typeScale, useThemeColors } from "@/constants/tokens";
import { authErrorMessage } from "@/lib/auth-errors";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

const MIN_PASSWORD_LENGTH = 8;

/** Force simple en 3 niveaux : 0 = invalide, 1 = fragile, 2 = correct, 3 = solide. */
function passwordStrength(password: string): 0 | 1 | 2 | 3 {
  if (password.length < MIN_PASSWORD_LENGTH) return 0;
  const hasMix = /\d/.test(password) && /[a-zA-Z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasSymbol = /[^a-zA-Z0-9]/.test(password);
  if (password.length >= 12 && hasMix && (hasUpper || hasSymbol)) return 3;
  if (password.length >= 10 && hasMix) return 2;
  return 1;
}

const STRENGTH_LABELS: Record<1 | 2 | 3, string> = {
  1: "Fragile",
  2: "Correct",
  3: "Solide",
};

function StrengthBar({ password }: { password: string }) {
  const colors = useThemeColors();
  const strength = passwordStrength(password);
  const barColors: Record<1 | 2 | 3, string> = {
    1: colors.danger,
    2: colors.shiftCp,
    3: colors.success,
  };
  const active = strength === 0 ? colors.surfaceMuted : barColors[strength];

  if (!password) return null;

  return (
    <View style={strengthStyles.row}>
      <View style={strengthStyles.bars}>
        {[1, 2, 3].map((level) => (
          <View
            key={level}
            style={[
              strengthStyles.bar,
              { backgroundColor: level <= strength ? active : colors.surfaceMuted },
            ]}
          />
        ))}
      </View>
      <Text style={[strengthStyles.label, { color: strength === 0 ? colors.textMuted : active }]}>
        {strength === 0 ? `${MIN_PASSWORD_LENGTH} caractères minimum` : STRENGTH_LABELS[strength]}
      </Text>
    </View>
  );
}

export default function AccountSettingsScreen() {
  const colors = useThemeColors();
  const { session } = useAuth();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isChangingEmail, setIsChangingEmail] = useState(false);

  const isGuest = session?.user.is_anonymous ?? false;
  const email = session?.user.email ?? "";

  const isPasswordValid = newPassword.length >= MIN_PASSWORD_LENGTH;
  const doPasswordsMatch = newPassword === confirmPassword;
  const canSubmitPassword = isPasswordValid && doPasswordsMatch && confirmPassword.length > 0;
  const canSubmitEmail = newEmail.trim().length > 0 && newEmail.trim() !== email;

  const [promoCode, setPromoCode] = useState("");
  const [isRedeeming, setIsRedeeming] = useState(false);

  async function handleRedeemCode() {
    if (!promoCode.trim()) return;
    setIsRedeeming(true);
    const { data, error } = await supabase.rpc("redeem_promo_code", { p_code: promoCode });
    setIsRedeeming(false);
    if (error) {
      Alert.alert("Code refusé", "Ce code est invalide ou a déjà été utilisé au maximum.");
    } else {
      setPromoCode("");
      Alert.alert(
        "Accès débloqué 🎉",
        data === "founder"
          ? "Tu fais partie des fondateur·ices : scans illimités, à vie."
          : "Accès Premium activé : scans illimités.",
      );
    }
  }

  async function handleChangePassword() {
    if (!canSubmitPassword) return;
    setIsChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setIsChangingPassword(false);
    if (error) {
      Alert.alert("Erreur", authErrorMessage(error));
    } else {
      setNewPassword("");
      setConfirmPassword("");
      Alert.alert("Mot de passe mis à jour ✅");
    }
  }

  function handleChangeEmail() {
    if (!canSubmitEmail) return;
    const target = newEmail.trim();
    Alert.alert(
      "Changer d'email ?",
      `Ton email passera de ${email} à ${target}. Un email de confirmation peut t'être envoyé.`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Confirmer",
          onPress: async () => {
            setIsChangingEmail(true);
            const { error } = await supabase.auth.updateUser({ email: target });
            setIsChangingEmail(false);
            if (error) {
              Alert.alert("Erreur", authErrorMessage(error));
            } else {
              setNewEmail("");
              Alert.alert("Email mis à jour ✅", "Pense à valider l'email de confirmation.");
            }
          },
        },
      ],
    );
  }

  function handleDeleteAccount() {
    Alert.alert(
      "Supprimer ton compte ?",
      "Toutes tes données (plannings, scans, partages) seront définitivement effacées.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Continuer",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Dernière confirmation",
              "Cette action est irréversible. Supprimer ton compte maintenant ?",
              [
                { text: "Annuler", style: "cancel" },
                {
                  text: "Supprimer définitivement",
                  style: "destructive",
                  onPress: async () => {
                    const { error } = await supabase.rpc("delete_account");
                    if (error) {
                      Alert.alert("Suppression impossible", authErrorMessage(error));
                    } else {
                      await supabase.auth.signOut();
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
        >
          <SubPageHeader title="Compte" />

          {isGuest ? (
            <Section
              icon="person-circle"
              iconBg={colors.accentMuted}
              iconColor={colors.accent}
              title="Mode invité"
              subtitle="Pas encore de compte associé"
            >
              <Text style={[styles.guestText, { color: colors.textMuted }]}>
                Crée ton compte gratuit depuis l'accueil du profil pour définir un email et un mot
                de passe — toutes tes données seront conservées.
              </Text>
            </Section>
          ) : (
            <>
              <Section
                icon="mail"
                iconBg={colors.accentMuted}
                iconColor={colors.accent}
                title="Email"
                subtitle="Adresse de connexion actuelle"
              >
                <Text style={[styles.emailValue, { color: colors.text, backgroundColor: colors.surfaceMuted }]}>
                  {email}
                </Text>
                <TextField
                  label="Nouvel email"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="nouveau@exemple.fr"
                  value={newEmail}
                  onChangeText={setNewEmail}
                />
                {newEmail.trim() ? (
                  <Button
                    label="Changer d'email"
                    variant="dark"
                    onPress={handleChangeEmail}
                    disabled={!canSubmitEmail}
                    isLoading={isChangingEmail}
                  />
                ) : null}
              </Section>

              <Section
                icon="key"
                iconBg={colors.surfaceMuted}
                iconColor={colors.text}
                title="Mot de passe"
                subtitle="8 caractères minimum"
              >
                <TextField
                  label="Nouveau mot de passe"
                  secureToggle
                  placeholder="8 caractères minimum"
                  value={newPassword}
                  onChangeText={setNewPassword}
                />
                <StrengthBar password={newPassword} />
                <TextField
                  label="Confirmation"
                  secureToggle
                  placeholder="Le même, pour être sûr·e"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  hint={
                    confirmPassword.length > 0 && !doPasswordsMatch
                      ? "Les deux mots de passe ne correspondent pas."
                      : undefined
                  }
                />
                {newPassword ? (
                  <Button
                    label="Mettre à jour le mot de passe"
                    variant="dark"
                    onPress={handleChangePassword}
                    disabled={!canSubmitPassword}
                    isLoading={isChangingPassword}
                  />
                ) : null}
              </Section>

              <Section
                icon="sparkles"
                iconBg={colors.accentMuted}
                iconColor={colors.accent}
                title="Code d'accès"
                subtitle="Code VIP ou Premium reçu par l'équipe Clork"
              >
                <TextField
                  label="Code"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholder="EX : CLORK-VIP"
                  value={promoCode}
                  onChangeText={setPromoCode}
                />
                {promoCode.trim() ? (
                  <Button
                    label="Activer mon accès"
                    variant="dark"
                    onPress={handleRedeemCode}
                    isLoading={isRedeeming}
                  />
                ) : null}
              </Section>

              <Section
                icon="warning"
                iconBg="#FBE3E4"
                iconColor={colors.danger}
                title="Zone danger"
                subtitle="Suppression définitive du compte"
              >
                <Text style={[styles.guestText, { color: colors.textMuted }]}>
                  Plannings, scans et partages seront effacés. Cette action est irréversible.
                </Text>
                <Button label="Supprimer mon compte" variant="danger" onPress={handleDeleteAccount} />
              </Section>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const strengthStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  bars: { flex: 1, flexDirection: "row", gap: spacing.xs },
  bar: { flex: 1, height: 6, borderRadius: radius.pill },
  label: { fontSize: typeScale.caption, fontFamily: fonts.bold },
});

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  guestText: { fontSize: typeScale.caption, fontFamily: fonts.semiBold, lineHeight: 18 },
  emailValue: {
    fontSize: typeScale.body,
    fontFamily: fonts.bold,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
});
