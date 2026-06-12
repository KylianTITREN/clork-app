import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import {
  fonts,
  inkOnAccent,
  radius,
  softShadow,
  spacing,
  typeScale,
  useThemeColors,
  type ThemeColors,
} from "@/constants/tokens";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { useAuth } from "@/providers/auth-provider";

type SectionProps = {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle?: string;
  colors: ThemeColors;
  children: React.ReactNode;
};

function Section({ icon, iconBg, iconColor, title, subtitle, colors, children }: SectionProps) {
  return (
    <View style={[styles.section, { backgroundColor: colors.surface }, softShadow]}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIcon, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
        <View style={styles.sectionTitleBox}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>{subtitle}</Text>
          ) : null}
        </View>
      </View>
      {children}
    </View>
  );
}

type FormSnapshot = {
  displayName: string;
  planningNames: string;
  employeeId: string;
  breakMinutes: string;
  breakThreshold: string;
  breakStart: string;
};

export default function ProfileScreen() {
  const colors = useThemeColors();
  const { session } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [planningNames, setPlanningNames] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [breakMinutes, setBreakMinutes] = useState("0");
  const [breakThreshold, setBreakThreshold] = useState("6");
  const [breakStart, setBreakStart] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState<FormSnapshot | null>(null);
  const [upgradeEmail, setUpgradeEmail] = useState("");
  const [upgradePassword, setUpgradePassword] = useState("");
  const [isUpgrading, setIsUpgrading] = useState(false);

  const userId = session?.user.id;
  const isGuest = session?.user.is_anonymous ?? false;
  const email = session?.user.email ?? null;
  const initial = (displayName.trim() || email || "C").charAt(0).toUpperCase();

  const isDirty =
    savedSnapshot != null &&
    (displayName !== savedSnapshot.displayName ||
      planningNames !== savedSnapshot.planningNames ||
      employeeId !== savedSnapshot.employeeId ||
      breakMinutes !== savedSnapshot.breakMinutes ||
      breakThreshold !== savedSnapshot.breakThreshold ||
      breakStart !== savedSnapshot.breakStart);

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
      setBreakStart(data.break_start_default ? data.break_start_default.slice(0, 5) : "");
      setSavedSnapshot({
        displayName: data.display_name,
        planningNames: data.employee_aliases.join(", "),
        employeeId: data.employee_id ?? "",
        breakMinutes: String(data.break_default_minutes ?? 0),
        breakThreshold: String(data.break_threshold_hours ?? 6),
        breakStart: data.break_start_default ? data.break_start_default.slice(0, 5) : "",
      });
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
    const trimmedStart = breakStart.trim();
    if (trimmedStart && !/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmedStart)) {
      setIsSaving(false);
      Alert.alert("Heure de pause invalide", "Format attendu : HH:MM (ex 12:30), ou laisse vide.");
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim(),
        employee_aliases: aliases,
        employee_id: employeeId.trim() || null,
        break_default_minutes: parsedBreak,
        break_threshold_hours: parsedThreshold,
        break_start_default: trimmedStart || null,
      })
      .eq("id", userId);
    setIsSaving(false);
    if (error) {
      Alert.alert("Erreur", "Sauvegarde impossible : " + error.message);
    } else {
      setSavedSnapshot({ displayName, planningNames, employeeId, breakMinutes, breakThreshold, breakStart });
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
          showsVerticalScrollIndicator={false}
        >
          {/* En-tête identité + action d'enregistrement */}
          <View style={styles.headerRow}>
            <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
              <Text style={styles.avatarLetter}>{initial}</Text>
            </View>
            <View style={styles.headerTextBox}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                {displayName.trim() || "Mon profil"}
              </Text>
              <Text style={[styles.headerMeta, { color: colors.textMuted }]} numberOfLines={1}>
                {isGuest ? "Mode invité · 1 scan/semaine" : (email ?? "")}
              </Text>
            </View>
            {!isLoading ? (
              <Pressable
                onPress={handleSave}
                disabled={isSaving || !isDirty}
                style={({ pressed }) => [
                  styles.savePill,
                  {
                    backgroundColor: isDirty ? colors.accent : colors.surfaceMuted,
                    opacity: isSaving ? 0.5 : pressed && isDirty ? 0.85 : 1,
                  },
                  isDirty && softShadow,
                ]}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color={inkOnAccent} />
                ) : (
                  <>
                    <Ionicons
                      name={isDirty ? "checkmark" : "checkmark-done"}
                      size={16}
                      color={isDirty ? inkOnAccent : colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.savePillLabel,
                        { color: isDirty ? inkOnAccent : colors.textMuted },
                      ]}
                    >
                      {isDirty ? "Enregistrer" : "À jour"}
                    </Text>
                  </>
                )}
              </Pressable>
            ) : null}
          </View>

          {isGuest ? (
            <View style={[styles.section, { backgroundColor: colors.accentMuted }]}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIcon, { backgroundColor: colors.accent }]}>
                  <Ionicons name="rocket" size={18} color={inkOnAccent} />
                </View>
                <View style={styles.sectionTitleBox}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    Crée ton compte gratuit
                  </Text>
                  <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
                    Données conservées · partage débloqué · scans illimités
                  </Text>
                </View>
              </View>
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
            </View>
          ) : null}

          {isLoading ? null : (
            <>
              <Section
                icon="finger-print"
                iconBg={colors.accentMuted}
                iconColor={colors.accent}
                title="Sur le planning"
                subtitle="Pour retrouver TA ligne automatiquement"
                colors={colors}
              >
                <TextField
                  label="Prénom (ou pseudo)"
                  placeholder="Typhanie"
                  value={displayName}
                  onChangeText={setDisplayName}
                />
                <TextField
                  label="Nom sur le planning"
                  placeholder="COPIN Typhanie, Typhanie"
                  hint="Plusieurs variantes possibles, séparées par des virgules."
                  value={planningNames}
                  onChangeText={setPlanningNames}
                />
                <TextField
                  label="ID employé (optionnel)"
                  placeholder="ex: 10684512"
                  value={employeeId}
                  onChangeText={setEmployeeId}
                />
              </Section>

              <Section
                icon="cafe"
                iconBg={colors.shiftCpSoft}
                iconColor={colors.shiftCp}
                title="Pause déjeuner"
                subtitle="Si le planning n'imprime pas la durée payée"
                colors={colors}
              >
                <View style={styles.fieldRow}>
                  <View style={styles.fieldHalf}>
                    <TextField
                      label="Durée (min)"
                      placeholder="60"
                      keyboardType="number-pad"
                      value={breakMinutes}
                      onChangeText={setBreakMinutes}
                    />
                  </View>
                  <View style={styles.fieldHalf}>
                    <TextField
                      label="Dès (heures)"
                      placeholder="6"
                      keyboardType="decimal-pad"
                      value={breakThreshold}
                      onChangeText={setBreakThreshold}
                    />
                  </View>
                </View>
                <TextField
                  label="Heure habituelle (optionnel)"
                  placeholder="12:30"
                  keyboardType="numbers-and-punctuation"
                  hint="Posée sur tes pauses à l'import — modifiable jour par jour ensuite."
                  value={breakStart}
                  onChangeText={setBreakStart}
                />
                <Text style={[styles.sectionFootnote, { color: colors.textMuted }]}>
                  Ex. : 60 min déduites dès que la journée dépasse 6 h d'amplitude.
                  0 = désactivé.
                </Text>
              </Section>

              <Pressable onPress={handleSignOut} style={styles.signOutRow} hitSlop={8}>
                <Ionicons name="log-out-outline" size={16} color={colors.textMuted} />
                <Text style={[styles.signOutLabel, { color: colors.textMuted }]}>
                  Se déconnecter
                </Text>
              </Pressable>
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    fontSize: typeScale.title,
    fontFamily: fonts.black,
    color: inkOnAccent,
  },
  headerTextBox: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: typeScale.title,
    fontFamily: fonts.black,
  },
  headerMeta: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
  },
  section: {
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  sectionIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitleBox: {
    flex: 1,
    gap: 1,
  },
  sectionTitle: {
    fontSize: typeScale.body,
    fontFamily: fonts.extraBold,
  },
  sectionSubtitle: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
  },
  sectionFootnote: {
    fontSize: typeScale.caption,
    fontFamily: fonts.regular,
    lineHeight: 17,
  },
  fieldRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  fieldHalf: {
    flex: 1,
  },
  savePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 110,
    justifyContent: "center",
  },
  savePillLabel: {
    fontSize: typeScale.caption,
    fontFamily: fonts.extraBold,
  },
  signOutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  signOutLabel: {
    fontSize: typeScale.caption,
    fontFamily: fonts.bold,
  },
});
