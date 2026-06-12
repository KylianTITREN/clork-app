import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SavePill } from "@/components/profile/SavePill";
import { Section } from "@/components/profile/Section";
import { SubPageHeader } from "@/components/profile/SubPageHeader";
import { TextField } from "@/components/ui/TextField";
import { spacing, useThemeColors } from "@/constants/tokens";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { useAuth } from "@/providers/auth-provider";

type FormSnapshot = {
  displayName: string;
  planningNames: string;
  employeeId: string;
};

export default function PlanningSettingsScreen() {
  const colors = useThemeColors();
  const { session } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [planningNames, setPlanningNames] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState<FormSnapshot | null>(null);

  const userId = session?.user.id;

  const isDirty =
    savedSnapshot != null &&
    (displayName !== savedSnapshot.displayName ||
      planningNames !== savedSnapshot.planningNames ||
      employeeId !== savedSnapshot.employeeId);

  const loadProfile = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single<Profile>();
    if (error) {
      Alert.alert("Erreur", "Impossible de charger ton profil : " + error.message);
      return;
    }
    if (data) {
      const snapshot: FormSnapshot = {
        displayName: data.display_name,
        planningNames: data.employee_aliases.join(", "),
        employeeId: data.employee_id ?? "",
      };
      setDisplayName(snapshot.displayName);
      setPlanningNames(snapshot.planningNames);
      setEmployeeId(snapshot.employeeId);
      setSavedSnapshot(snapshot);
    }
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
      setSavedSnapshot({ displayName, planningNames, employeeId });
    }
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
          <SubPageHeader
            title="Mon planning"
            right={
              savedSnapshot != null ? (
                <SavePill isDirty={isDirty} isSaving={isSaving} onPress={handleSave} />
              ) : null
            }
          />

          <Section
            icon="finger-print"
            iconBg={colors.accentMuted}
            iconColor={colors.accent}
            title="Sur le planning"
            subtitle="Pour retrouver TA ligne automatiquement"
          >
            <TextField label="Prénom (ou pseudo)" placeholder="Capucine" value={displayName} onChangeText={setDisplayName} />
            <TextField
              label="Nom sur le planning"
              placeholder="DUPONT Capucine, Capucine"
              hint="Plusieurs variantes possibles, séparées par des virgules."
              value={planningNames}
              onChangeText={setPlanningNames}
            />
            <TextField label="ID employé (optionnel)" placeholder="ex: 10684512" value={employeeId} onChangeText={setEmployeeId} />
          </Section>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
});
