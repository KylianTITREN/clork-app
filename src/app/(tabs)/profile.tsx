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
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const userId = session?.user.id;

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
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim(),
        employee_aliases: aliases,
        employee_id: employeeId.trim() || null,
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
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.title, { color: colors.text }]}>Profil</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Ces infos servent à retrouver TA ligne sur le planning photographié.
          </Text>

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
});
