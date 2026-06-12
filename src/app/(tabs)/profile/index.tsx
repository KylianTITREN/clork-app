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
import { TextField } from "@/components/ui/TextField";
import { NavRow } from "@/components/profile/NavRow";
import {
  fonts,
  radius,
  spacing,
  typeScale,
  useThemeColors,
} from "@/constants/tokens";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

export default function ProfileHubScreen() {
  const colors = useThemeColors();
  const { session } = useAuth();

  const [displayName, setDisplayName] = useState("");
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
        .select("display_name")
        .eq("id", userId)
        .single<{ display_name: string }>()
        .then(({ data }) => {
          if (data) setDisplayName(data.display_name);
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
          {/* En-tête identité */}
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
          </View>

          {isGuest ? (
            <View style={[styles.upgradeCard, { backgroundColor: colors.accentMuted }]}>
              <View style={styles.upgradeHeader}>
                <View style={[styles.upgradeIcon, { backgroundColor: colors.accent }]}>
                  <Ionicons name="rocket" size={18} color={colors.onAccent} />
                </View>
                <View style={styles.upgradeTitleBox}>
                  <Text style={[styles.upgradeTitle, { color: colors.text }]}>Crée ton compte gratuit</Text>
                  <Text style={[styles.upgradeSubtitle, { color: colors.textMuted }]}>
                    Données conservées · partage débloqué
                  </Text>
                </View>
              </View>
              <TextField label="Email" autoCapitalize="none" keyboardType="email-address" placeholder="capucine@exemple.fr" value={upgradeEmail} onChangeText={setUpgradeEmail} />
              <TextField label="Mot de passe" secureToggle placeholder="8 caractères minimum" value={upgradePassword} onChangeText={setUpgradePassword} />
              <Button label="Créer mon compte" onPress={handleUpgrade} isLoading={isUpgrading} />
            </View>
          ) : null}

          <NavRow
            icon="finger-print"
            iconBg={colors.accentMuted}
            iconColor={colors.accent}
            title="Mon planning"
            subtitle="Nom sur le planning · ID employé"
            onPress={() => router.push("/profile/planning")}
          />
          <NavRow
            icon="cafe"
            iconBg={colors.shiftCpSoft}
            iconColor={colors.shiftCp}
            title="Pause déjeuner"
            subtitle="Durée par défaut · heure habituelle"
            onPress={() => router.push("/profile/pause")}
          />
          <NavRow
            icon="heart"
            iconBg={colors.shiftMeetingSoft}
            iconColor={colors.shiftMeeting}
            title="Partage & suivi"
            subtitle="Mon code · plannings suivis"
            onPress={() => router.push("/profile/sharing")}
          />
          <NavRow
            icon="color-palette"
            iconBg={colors.accentMuted}
            iconColor={colors.accent}
            title="Thème"
            subtitle="Couleur de l'app et de son icône"
            onPress={() => router.push("/profile/theme")}
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
            icon="key"
            iconBg={colors.surfaceMuted}
            iconColor={colors.text}
            title="Compte"
            subtitle={isGuest ? "Mode invité" : "Email · mot de passe · suppression"}
            onPress={() => router.push("/profile/account")}
          />

          <Pressable onPress={handleSignOut} style={styles.signOutRow} hitSlop={8}>
            <Ionicons name="log-out-outline" size={16} color={colors.textMuted} />
            <Text style={[styles.signOutLabel, { color: colors.textMuted }]}>Se déconnecter</Text>
          </Pressable>
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
  upgradeCard: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.md },
  upgradeHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  upgradeIcon: { width: 38, height: 38, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  upgradeTitleBox: { flex: 1, gap: 1 },
  upgradeTitle: { fontSize: typeScale.body, fontFamily: fonts.extraBold },
  upgradeSubtitle: { fontSize: typeScale.caption, fontFamily: fonts.semiBold },
  signOutRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingVertical: spacing.sm },
  signOutLabel: { fontSize: typeScale.caption, fontFamily: fonts.bold },
});
