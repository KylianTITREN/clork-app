// Profil & réglages v2 (maquette 4c) : header sombre (avatar + nom + email),
// 5 lignes de navigation (Scan & horaires / Partage & suivi / Notifications /
// Apparence / Compte), footer « Se déconnecter » + « Propulsé par KYKS 🚀 ».
// Invité : carte création de compte + encart danger (déconnexion = perte).

import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
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
import { DarkHeader } from "@/components/ui/DarkHeader";
import { TextField } from "@/components/ui/TextField";
import { NavRow } from "@/components/profile/NavRow";
import {
  fonts,
  letterSpacing,
  radius,
  spacing,
  typeScale,
  useThemeColors,
} from "@/constants/tokens";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

const APP_VERSION = "2.0.0";

export default function ProfileHubScreen() {
  const colors = useThemeColors();
  const { session } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [plan, setPlan] = useState<string>("free");
  const [upgradeEmail, setUpgradeEmail] = useState("");
  const [upgradePassword, setUpgradePassword] = useState("");
  const [isUpgrading, setIsUpgrading] = useState(false);

  const userId = session?.user.id;
  const isGuest = session?.user.is_anonymous ?? false;
  const email = session?.user.email ?? null;
  const initial = (displayName.trim() || email || "C").charAt(0).toUpperCase();

  // Rechargé au focus : le prénom peut changer depuis la sous-page Planning.
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      supabase
        .from("profiles")
        .select("display_name, plan")
        .eq("id", userId)
        .single<{ display_name: string; plan: string }>()
        .then(({ data }) => {
          if (data) {
            setDisplayName(data.display_name);
            setPlan(data.plan);
          }
        });
    }, [userId]),
  );

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

  async function doSignOut() {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert("Erreur", error.message);
  }

  function handleSignOut() {
    // Compte d'essai : aucune donnée n'est rattachée à un e-mail/mot de passe.
    // Se déconnecter détruit la session anonyme → perte définitive.
    if (isGuest) {
      Alert.alert(
        "Mode invité — tes données seront perdues",
        "Tu n'as pas encore de compte : te déconnecter effacera définitivement tes plannings et tes horaires sur cet appareil. Crée un compte (gratuit, tout est conservé) pour les garder.",
        [
          { text: "Annuler", style: "cancel" },
          { text: "Créer un compte", style: "default" },
          { text: "Se déconnecter quand même", style: "destructive", onPress: doSignOut },
        ],
      );
      return;
    }
    void doSignOut();
  }

  return (
    <SafeAreaView edges={[]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <DarkHeader>
          <View style={styles.headerRow}>
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : router.navigate("/(tabs)"))}
              hitSlop={12}
              accessibilityLabel="Retour"
              style={styles.backButton}
            >
              <Ionicons name="chevron-back" size={22} color={colors.onInk} />
            </Pressable>
            {isGuest ? (
              <View style={[styles.avatar, styles.avatarGuest, { borderColor: colors.onInk }]}>
                <Ionicons name="person-outline" size={22} color={colors.onInk} />
              </View>
            ) : (
              <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
                <Text style={[styles.avatarLetter, { color: colors.onAccent }]}>{initial}</Text>
              </View>
            )}
            <View style={styles.headerTextBox}>
              <View style={styles.titleRow}>
                <Text style={[styles.title, { color: colors.onInk }]} numberOfLines={1}>
                  {isGuest ? "Invité" : displayName.trim() || "Mon profil"}
                </Text>
                {plan === "founder" ? (
                  <View style={[styles.planBadge, { backgroundColor: colors.accent }]}>
                    <Text style={[styles.planBadgeLabel, { color: colors.onAccent }]}>VIP 💛</Text>
                  </View>
                ) : plan === "premium" ? (
                  <View style={[styles.planBadge, { backgroundColor: colors.onInk }]}>
                    <Text style={[styles.planBadgeLabel, { color: colors.ink }]}>Premium ⭐</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.headerMeta, { color: colors.onInk, opacity: 0.65 }]} numberOfLines={1}>
                {isGuest ? "⚡ 1 scan/semaine" : (email ?? "")}
              </Text>
            </View>
          </View>
        </DarkHeader>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {isGuest ? (
            <View style={[styles.upgradeCard, { backgroundColor: colors.accentMuted }]}>
              <View style={styles.upgradeHeader}>
                <View style={[styles.upgradeIcon, { backgroundColor: colors.accent }]}>
                  <Ionicons name="rocket" size={18} color={colors.onAccent} />
                </View>
                <View style={styles.upgradeTitleBox}>
                  <Text style={[styles.upgradeTitle, { color: colors.text }]}>Crée ton compte gratuit</Text>
                  <Text style={[styles.upgradeSubtitle, { color: colors.textMuted }]}>
                    Tout ce que tu as déjà ajouté est conservé.
                  </Text>
                </View>
              </View>
              <TextField label="Email" autoCapitalize="none" keyboardType="email-address" placeholder="capucine@exemple.fr" value={upgradeEmail} onChangeText={setUpgradeEmail} />
              <TextField label="Mot de passe" secureToggle placeholder="8 caractères minimum" value={upgradePassword} onChangeText={setUpgradePassword} />
              <Button label="Créer mon compte" onPress={handleUpgrade} isLoading={isUpgrading} />
            </View>
          ) : null}

          {/* 5 destinations v2 */}
          <NavRow
            icon="scan"
            iconBg={colors.accentMuted}
            iconColor={colors.accent}
            title="Scan & horaires"
            subtitle="Nom sur le planning · créneaux types · pause"
            onPress={() => router.push("/profile/planning")}
          />
          <NavRow
            icon="heart"
            iconBg={colors.shiftMeetingSoft}
            iconColor={colors.shiftMeeting}
            title="Partage & suivi"
            subtitle="Mon code · code équipe · plannings suivis"
            onPress={() => router.push("/profile/sharing")}
          />
          <NavRow
            icon="notifications"
            iconBg={colors.shiftRhSoft}
            iconColor={colors.shiftRh}
            title="Notifications"
            subtitle="Rappels veille, matin et scan"
            onPress={() => router.push("/profile/notifications")}
          />
          <NavRow
            icon="color-palette"
            iconBg={colors.shiftCpSoft}
            iconColor={colors.shiftCp}
            title="Apparence"
            subtitle="Thème · icône · widgets"
            onPress={() => router.push("/profile/theme")}
          />
          <NavRow
            icon="key"
            iconBg={colors.surfaceMuted}
            iconColor={colors.text}
            title="Compte"
            subtitle={isGuest ? "Mode invité" : "Avatar · email · mot de passe"}
            onPress={() => router.push("/profile/account")}
          />

          {isGuest ? (
            <View style={[styles.dangerCard, { borderColor: colors.dangerBorder }]}>
              <Text style={[styles.dangerText, { color: colors.danger }]}>
                Sans compte, te déconnecter effacera définitivement tes plannings
                sur cet appareil.
              </Text>
              <Button label="Se déconnecter quand même" variant="danger" onPress={handleSignOut} />
            </View>
          ) : (
            <Pressable onPress={handleSignOut} style={styles.signOutRow} hitSlop={8}>
              <Ionicons name="log-out-outline" size={16} color={colors.textMuted} />
              <Text style={[styles.signOutLabel, { color: colors.textMuted }]}>Se déconnecter</Text>
            </Pressable>
          )}

          <Text style={[styles.poweredBy, { color: colors.textMuted }]}>
            Propulsé par KYKS 🚀 · v{APP_VERSION}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(247,246,242,0.12)",
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarGuest: {
    borderWidth: 1.5,
    borderStyle: "dashed",
  },
  avatarLetter: {
    fontSize: typeScale.heading,
    fontFamily: fonts.bold,
  },
  headerTextBox: { flex: 1, gap: 2 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  title: {
    fontSize: typeScale.title - 4,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.title,
    flexShrink: 1,
  },
  planBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  planBadgeLabel: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.bold,
  },
  headerMeta: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
  },
  content: { padding: spacing.lg, gap: spacing.sm + 2 },
  upgradeCard: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.md },
  upgradeHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  upgradeIcon: { width: 38, height: 38, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  upgradeTitleBox: { flex: 1, gap: 1 },
  upgradeTitle: { fontSize: typeScale.body, fontFamily: fonts.bold },
  upgradeSubtitle: { fontSize: typeScale.caption, fontFamily: fonts.medium },
  dangerCard: {
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm + 2,
    marginTop: spacing.sm,
  },
  dangerText: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
    lineHeight: 18,
  },
  signOutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  signOutLabel: { fontSize: typeScale.caption, fontFamily: fonts.bold },
  poweredBy: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
    textAlign: "center",
    opacity: 0.7,
    marginTop: spacing.sm,
  },
});
