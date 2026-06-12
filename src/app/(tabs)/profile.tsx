import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { TimePickerField } from "@/components/ui/TimePickerField";
import { themeLabels, themeOrder, themes, type ThemeId } from "@/constants/themes";
import {
  fonts,
  radius,
  softShadow,
  spacing,
  typeScale,
  useThemeColors,
  type ThemeColors,
} from "@/constants/tokens";
import { followUser, listFollowed, unfollowUser, type FollowedUser } from "@/lib/follow-service";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { useAuth } from "@/providers/auth-provider";
import { useTheme } from "@/providers/theme-provider";

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

function GroupTitle({ colors, children }: { colors: ThemeColors; children: string }) {
  return <Text style={[styles.groupTitle, { color: colors.textMuted }]}>{children}</Text>;
}

type FormSnapshot = {
  displayName: string;
  planningNames: string;
  employeeId: string;
  breakMinutes: string;
  breakThreshold: string;
  breakStart: string | null;
};

export default function ProfileScreen() {
  const colors = useThemeColors();
  const { session } = useAuth();
  const { themeId, setThemeId } = useTheme();

  const [displayName, setDisplayName] = useState("");
  const [planningNames, setPlanningNames] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [breakMinutes, setBreakMinutes] = useState("0");
  const [breakThreshold, setBreakThreshold] = useState("6");
  const [breakStart, setBreakStart] = useState<string | null>(null);
  const [followCode, setFollowCode] = useState("");
  const [followed, setFollowed] = useState<FollowedUser[]>([]);
  const [followInput, setFollowInput] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
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
      const start = data.break_start_default ? data.break_start_default.slice(0, 5) : null;
      setBreakStart(start);
      setFollowCode(data.follow_code ?? "");
      setSavedSnapshot({
        displayName: data.display_name,
        planningNames: data.employee_aliases.join(", "),
        employeeId: data.employee_id ?? "",
        breakMinutes: String(data.break_default_minutes ?? 0),
        breakThreshold: String(data.break_threshold_hours ?? 6),
        breakStart: start,
      });
    }
    listFollowed().then(setFollowed);
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
        break_start_default: breakStart,
      })
      .eq("id", userId);
    setIsSaving(false);
    if (error) {
      Alert.alert("Erreur", "Sauvegarde impossible : " + error.message);
    } else {
      setSavedSnapshot({ displayName, planningNames, employeeId, breakMinutes, breakThreshold, breakStart });
    }
  }

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
    if (error) Alert.alert("Création impossible", error.message);
    else Alert.alert("Compte créé ✅", "Toutes tes données sont conservées.");
  }

  async function handleFollow() {
    if (!followInput.trim()) return;
    try {
      const name = await followUser(followInput);
      setFollowInput("");
      listFollowed().then(setFollowed);
      Alert.alert("C'est fait 💛", `Tu suis maintenant le planning de ${name}.`);
    } catch (error) {
      Alert.alert("Suivi impossible", error instanceof Error ? error.message : "Erreur");
    }
  }

  async function handleShareFollowCode() {
    await Share.share({
      message:
        `Suis mon planning sur Clork 💛 Ouvre Profil → « Suivre un planning » et saisis mon code : ${followCode.toUpperCase()}`,
    });
  }

  async function handleChangePassword() {
    if (newPassword.length < 8) {
      Alert.alert("Mot de passe trop court", "8 caractères minimum.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) Alert.alert("Erreur", error.message);
    else {
      setNewPassword("");
      Alert.alert("Mot de passe mis à jour ✅");
    }
  }

  async function handleChangeEmail() {
    if (!newEmail.trim()) return;
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    if (error) Alert.alert("Erreur", error.message);
    else {
      setNewEmail("");
      Alert.alert("Email mis à jour ✅", "Un email de confirmation peut t'être envoyé.");
    }
  }

  function handleDeleteAccount() {
    Alert.alert(
      "Supprimer ton compte ?",
      "Toutes tes données (plannings, scans, partages) seront définitivement effacées.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer définitivement",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase.rpc("delete_account");
            if (error) {
              Alert.alert("Suppression impossible", error.message);
            } else {
              await supabase.auth.signOut();
            }
          },
        },
      ],
    );
  }

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert("Erreur", error.message);
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
          {/* En-tête identité + enregistrement */}
          <View style={styles.headerRow}>
            <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
              <Text style={[styles.avatarLetter, { color: colors.onAccent }]}>{initial}</Text>
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
                  <ActivityIndicator size="small" color={colors.onAccent} />
                ) : (
                  <>
                    <Ionicons
                      name={isDirty ? "checkmark" : "checkmark-done"}
                      size={16}
                      color={isDirty ? colors.onAccent : colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.savePillLabel,
                        { color: isDirty ? colors.onAccent : colors.textMuted },
                      ]}
                    >
                      {isDirty ? "Enregistrer" : "Enregistré"}
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
                  <Ionicons name="rocket" size={18} color={colors.onAccent} />
                </View>
                <View style={styles.sectionTitleBox}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Crée ton compte gratuit</Text>
                  <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
                    Données conservées · partage débloqué
                  </Text>
                </View>
              </View>
              <TextField label="Email" autoCapitalize="none" keyboardType="email-address" placeholder="capucine@exemple.fr" value={upgradeEmail} onChangeText={setUpgradeEmail} />
              <TextField label="Mot de passe" secureToggle placeholder="8 caractères minimum" value={upgradePassword} onChangeText={setUpgradePassword} />
              <Button label="Créer mon compte" onPress={handleUpgrade} isLoading={isUpgrading} />
            </View>
          ) : null}

          {isLoading ? null : (
            <>
              <GroupTitle colors={colors}>Mon planning</GroupTitle>
              <Section icon="finger-print" iconBg={colors.accentMuted} iconColor={colors.accent} title="Sur le planning" subtitle="Pour retrouver TA ligne automatiquement" colors={colors}>
                <TextField label="Prénom (ou pseudo)" placeholder="Capucine" value={displayName} onChangeText={setDisplayName} />
                <TextField label="Nom sur le planning" placeholder="DUPONT Capucine, Capucine" hint="Plusieurs variantes possibles, séparées par des virgules." value={planningNames} onChangeText={setPlanningNames} />
                <TextField label="ID employé (optionnel)" placeholder="ex: 10684512" value={employeeId} onChangeText={setEmployeeId} />
              </Section>

              <Section icon="cafe" iconBg={colors.shiftCpSoft} iconColor={colors.shiftCp} title="Pause déjeuner" subtitle="Si le planning n'imprime pas la durée payée" colors={colors}>
                <View style={styles.fieldRow}>
                  <View style={styles.fieldHalf}>
                    <TextField label="Durée (min)" placeholder="60" keyboardType="number-pad" value={breakMinutes} onChangeText={setBreakMinutes} />
                  </View>
                  <View style={styles.fieldHalf}>
                    <TextField label="Dès (heures)" placeholder="6" keyboardType="decimal-pad" value={breakThreshold} onChangeText={setBreakThreshold} />
                  </View>
                </View>
                <View style={styles.pauseTimeRow}>
                  <Text style={[styles.inlineLabel, { color: colors.textMuted }]}>HEURE HABITUELLE</Text>
                  <TimePickerField value={breakStart} onChange={setBreakStart} placeholder="12:30" />
                  {breakStart ? (
                    <Pressable onPress={() => setBreakStart(null)} hitSlop={8}>
                      <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                    </Pressable>
                  ) : null}
                </View>
              </Section>

              <GroupTitle colors={colors}>Partage & suivi</GroupTitle>
              <Section icon="heart" iconBg={colors.shiftMeetingSoft} iconColor={colors.shiftMeeting} title="Mon code de suivi" subtitle="Ton/ta partenaire voit ton planning en lecture seule" colors={colors}>
                <View style={styles.codeRow}>
                  <Text style={[styles.codeValue, { color: colors.text, backgroundColor: colors.surfaceMuted }]}>
                    {followCode.toUpperCase()}
                  </Text>
                  <Pressable onPress={handleShareFollowCode} style={[styles.codeShare, { backgroundColor: colors.accent }]}>
                    <Ionicons name="share-outline" size={18} color={colors.onAccent} />
                  </Pressable>
                </View>
              </Section>

              <Section icon="eye" iconBg={colors.shiftRhSoft} iconColor={colors.shiftRh} title="Suivre un planning" subtitle="Saisis le code reçu — le planning apparaîtra dans l'onglet Planning" colors={colors}>
                <View style={styles.codeRow}>
                  <TextInput
                    value={followInput}
                    onChangeText={setFollowInput}
                    placeholder="Code (ex: A3F2B1C4)"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    style={[styles.followInput, { backgroundColor: colors.surfaceMuted, color: colors.text }]}
                  />
                  <Pressable onPress={handleFollow} disabled={!followInput.trim()} style={[styles.codeShare, { backgroundColor: colors.accent, opacity: followInput.trim() ? 1 : 0.4 }]}>
                    <Ionicons name="arrow-forward" size={18} color={colors.onAccent} />
                  </Pressable>
                </View>
                {followed.map((f) => (
                  <View key={f.id} style={styles.followedRow}>
                    <Text style={[styles.followedName, { color: colors.text }]}>{f.displayName}</Text>
                    <Pressable
                      onPress={() =>
                        Alert.alert("Ne plus suivre ?", f.displayName, [
                          { text: "Annuler", style: "cancel" },
                          { text: "Ne plus suivre", style: "destructive", onPress: async () => { await unfollowUser(f.id); listFollowed().then(setFollowed); } },
                        ])
                      }
                      hitSlop={8}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </Pressable>
                  </View>
                ))}
              </Section>

              <GroupTitle colors={colors}>Réglages</GroupTitle>
              <Section icon="color-palette" iconBg={colors.accentMuted} iconColor={colors.accent} title="Thème" subtitle="Couleur de l'app et de son icône" colors={colors}>
                <View style={styles.themeGrid}>
                  {themeOrder.map((id) => {
                    const isSelected = id === themeId;
                    return (
                      <Pressable key={id} onPress={() => setThemeId(id as ThemeId)} style={styles.themeItem}>
                        <View style={[styles.themeSwatchRing, { borderColor: isSelected ? colors.text : "transparent" }]}>
                          <View style={[styles.themeSwatch, { backgroundColor: themes[id as ThemeId].accent }]}>
                            {isSelected ? <Ionicons name="checkmark" size={16} color={themes[id as ThemeId].onAccent} /> : null}
                          </View>
                        </View>
                        <Text style={[styles.themeLabel, { color: isSelected ? colors.text : colors.textMuted, fontFamily: isSelected ? fonts.extraBold : fonts.semiBold }]}>
                          {themeLabels[id as ThemeId]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Section>

              {!isGuest ? (
                <>
                  <GroupTitle colors={colors}>Compte</GroupTitle>
                  <Section icon="key" iconBg={colors.surfaceMuted} iconColor={colors.text} title="Identifiants" subtitle={email ?? ""} colors={colors}>
                    <TextField label="Nouveau mot de passe" secureToggle placeholder="8 caractères minimum" value={newPassword} onChangeText={setNewPassword} />
                    {newPassword ? <Button label="Mettre à jour le mot de passe" variant="dark" onPress={handleChangePassword} /> : null}
                    <TextField label="Nouvel email" autoCapitalize="none" keyboardType="email-address" placeholder="nouveau@exemple.fr" value={newEmail} onChangeText={setNewEmail} />
                    {newEmail ? <Button label="Mettre à jour l'email" variant="dark" onPress={handleChangeEmail} /> : null}
                  </Section>
                </>
              ) : null}

              <Pressable onPress={handleSignOut} style={styles.signOutRow} hitSlop={8}>
                <Ionicons name="log-out-outline" size={16} color={colors.textMuted} />
                <Text style={[styles.signOutLabel, { color: colors.textMuted }]}>Se déconnecter</Text>
              </Pressable>
              {!isGuest ? (
                <Pressable onPress={handleDeleteAccount} style={styles.signOutRow} hitSlop={8}>
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                  <Text style={[styles.signOutLabel, { color: colors.danger }]}>Supprimer mon compte</Text>
                </Pressable>
              ) : null}
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
  content: { padding: spacing.lg, gap: spacing.md },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.sm },
  avatar: { width: 60, height: 60, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  avatarLetter: { fontSize: typeScale.title, fontFamily: fonts.black },
  headerTextBox: { flex: 1, gap: 2 },
  title: { fontSize: typeScale.title, fontFamily: fonts.black },
  headerMeta: { fontSize: typeScale.caption, fontFamily: fonts.semiBold },
  savePill: { flexDirection: "row", alignItems: "center", gap: spacing.xs, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minWidth: 110, justifyContent: "center" },
  savePillLabel: { fontSize: typeScale.caption, fontFamily: fonts.extraBold },
  groupTitle: { fontSize: typeScale.caption, fontFamily: fonts.extraBold, textTransform: "uppercase", letterSpacing: 1, marginTop: spacing.sm },
  section: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.md },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sectionIcon: { width: 38, height: 38, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  sectionTitleBox: { flex: 1, gap: 1 },
  sectionTitle: { fontSize: typeScale.body, fontFamily: fonts.extraBold },
  sectionSubtitle: { fontSize: typeScale.caption, fontFamily: fonts.semiBold },
  fieldRow: { flexDirection: "row", gap: spacing.md },
  fieldHalf: { flex: 1 },
  pauseTimeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  inlineLabel: { flex: 1, fontSize: typeScale.caption, fontFamily: fonts.bold, letterSpacing: 0.6 },
  codeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  codeValue: { flex: 1, fontSize: typeScale.heading, fontFamily: fonts.extraBold, letterSpacing: 3, textAlign: "center", paddingVertical: spacing.sm, borderRadius: radius.sm },
  codeShare: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  followInput: { flex: 1, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2, fontSize: typeScale.body, fontFamily: fonts.bold, letterSpacing: 2 },
  followedRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.xs },
  followedName: { fontSize: typeScale.body, fontFamily: fonts.bold },
  themeGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  themeItem: { alignItems: "center", gap: spacing.xs, width: 72 },
  themeSwatchRing: { borderWidth: 2, borderRadius: radius.pill, padding: 3 },
  themeSwatch: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  themeLabel: { fontSize: 11 },
  signOutRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingVertical: spacing.sm },
  signOutLabel: { fontSize: typeScale.caption, fontFamily: fonts.bold },
});
