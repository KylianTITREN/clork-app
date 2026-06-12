import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { spacing, typeScale, useThemeColors } from "@/constants/tokens";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { useAuth } from "@/providers/auth-provider";

export default function ProfileScreen() {
  const colors = useThemeColors();
  const { session } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [planningNames, setPlanningNames] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [breakMinutes, setBreakMinutes] = useState("0");
  const [breakThreshold, setBreakThreshold] = useState("6");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [upgradeEmail, setUpgradeEmail] = useState("");
  const [upgradePassword, setUpgradePassword] = useState("");
  const [isUpgrading, setIsUpgrading] = useState(false);

  const userId = session?.user.id;
  const isGuest = session?.user.is_anonymous ?? false;

  async function handleUpgrade() {
    if (!upgradeEmail.trim() || upgradePassword.length < 8) {
      Alert.alert("Champs invalides", "Email valide + mot de passe de 8 caractères minimum.");
      return;
    }
    setIsUpgrading(true);
    const { error } = await supabase.auth.updateUser({
      email: upgradeEmail.trim(),
      password: upgradePassword,
    });
    setIsUpgrading(false);
    if (error) {
      Alert.alert("Création impossible", error.message);
    } else {
      Alert.alert(
        "Compte créé ✅",
        "Toutes tes données sont conservées. Le partage et les scans illimités sont débloqués.",
      );
    }
  }

  const loadProfile = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single<Profile>();
    if (error) {
      Alert.alert("Erreur", "Impossible de charger ton profil : " + error.message);
    } else if (data) {
      setDisplayName(data.display_name);
      setPlanningNames(data.employee_aliases.join(", "));
      setEmployeeId(data.employee_id ?? "");
      setBreakMinutes(String(data.break_default_minutes ?? 0));
      setBreakThreshold(String(data.break_threshold_hours ?? 6));
    }
    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  async function handleSave() {
    if (!userId) return;
    if (!displayName.trim()) {
      Alert.alert("Champ manquant", "Ton prénom (ou pseudo) est obligatoire.");
      return;
    }
    setIsSaving(true);
    const aliases = planningNames
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
    const parsedBreak = Math.min(240, Math.max(0, parseInt(breakMinutes, 10) || 0));
    const parsedThreshold = Math.min(13, Math.max(0, parseFloat(breakThreshold.replace(",", ".")) || 6));
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim(),
        employee_aliases: aliases,
        employee_id: employeeId.trim() || null,
        break_default_minutes: parsedBreak,
        break_threshold_hours: parsedThreshold,
      })
      .eq("id", userId);
    setIsSaving(false);
    if (error) {
      Alert.alert("Erreur", "Sauvegarde impossible : " + error.message);
    } else {
      Alert.alert("Profil enregistré", "Tes infos planning sont à jour. ✅");
    }
  }

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert("Erreur", error.message);
    }
  }

  return (
    <SafeAreaView edges={["top"]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
        >
          <Text style={[styles.title, { color: colors.text }]}>Profil</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Ces infos servent à retrouver TA ligne sur le planning photographié.
          </Text>

          {isGuest ? (
            <>
              <Text style={[styles.guestTitle, { color: colors.accent }]}>
                Mode invité — crée ton compte
              </Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                Gratuit, tes données sont conservées : ça débloque le partage avec
                tes collègues et les scans illimités.
              </Text>
              <TextField
                label="Email"
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="typhanie@exemple.fr"
                value={upgradeEmail}
                onChangeText={setUpgradeEmail}
              />
              <TextField
                label="Mot de passe"
                secureTextEntry
                placeholder="8 caractères minimum"
                value={upgradePassword}
                onChangeText={setUpgradePassword}
              />
              <Button label="Créer mon compte" onPress={handleUpgrade} isLoading={isUpgrading} />
            </>
          ) : null}

          {isLoading ? null : (
            <>
              <TextField
                label="Prénom (ou pseudo)"
                placeholder="Typhanie"
                value={displayName}
                onChangeText={setDisplayName}
              />
              <TextField
                label="Nom sur le planning"
                placeholder="COPIN Typhanie, Typhanie"
                hint="Tel qu'il apparaît sur le planning papier. Plusieurs variantes possibles, séparées par des virgules."
                value={planningNames}
                onChangeText={setPlanningNames}
              />
              <TextField
                label="ID employé (optionnel)"
                placeholder="ex: 10684512"
                hint="Utile si le planning affiche des matricules."
                value={employeeId}
                onChangeText={setEmployeeId}
              />
              <TextField
                label="Pause par défaut (minutes)"
                placeholder="60"
                keyboardType="number-pad"
                hint="Utilisée seulement si le planning n'imprime pas la durée payée. 0 = désactivé."
                value={breakMinutes}
                onChangeText={setBreakMinutes}
              />
              <TextField
                label="À partir de combien d'heures ?"
                placeholder="6"
                keyboardType="decimal-pad"
                hint="La pause s'applique dès que la journée atteint cette amplitude."
                value={breakThreshold}
                onChangeText={setBreakThreshold}
              />
              <Button label="Enregistrer" onPress={handleSave} isLoading={isSaving} />
              <Button label="Se déconnecter" variant="ghost" onPress={handleSignOut} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontSize: typeScale.title,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: typeScale.body,
    marginBottom: spacing.sm,
  },
  guestTitle: {
    fontSize: typeScale.heading,
    fontWeight: "800",
  },
});
