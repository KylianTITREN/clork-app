// Profil & réglages v2 (maquette 4c) : hub CLAIR — bouton ✕ rond bordé,
// avatar (invité : cercle pointillé « ? », connecté : l'avatar CHOISI dans
// Compte — initiale ou animal de la collection Premium),
// carte création de compte bordée accent (invité), 4-5 lignes de nav à dot
// couleur, encart danger pointillé (invité) ou « Se déconnecter » (connecté).

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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { AvatarFace } from "@/components/ui/AvatarFace";
import { Button } from "@/components/ui/Button";
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
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [avatar, setAvatar] = useState<string>("letter");
  const [plan, setPlan] = useState<string>("free");
  const [upgradeEmail, setUpgradeEmail] = useState("");
  const [upgradePassword, setUpgradePassword] = useState("");
  const [isUpgrading, setIsUpgrading] = useState(false);

  const userId = session?.user.id;
  const isGuest = session?.user.is_anonymous ?? false;
  const email = session?.user.email ?? null;

  // Rechargé au focus : le prénom peut changer depuis la sous-page Planning,
  // l'avatar depuis la sous-page Compte.
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      supabase
        .from("profiles")
        .select("display_name, plan, avatar")
        .eq("id", userId)
        .single<{ display_name: string; plan: string; avatar: string | null }>()
        .then(({ data }) => {
          if (data) {
            setDisplayName(data.display_name);
            setPlan(data.plan);
            setAvatar(data.avatar ?? "letter");
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
    <SafeAreaView edges={["top"]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.navigate("/(tabs)"))}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Fermer"
            style={({ pressed }) => [
              styles.closeButton,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Ionicons name="close" size={18} color={colors.text} />
          </Pressable>
          {isGuest ? (
            <View
              style={[
                styles.avatar,
                styles.avatarGuest,
                { backgroundColor: colors.surfaceMuted, borderColor: colors.textDisabled },
              ]}
            >
              <Ionicons name="help" size={22} color={colors.textMuted} />
            </View>
          ) : (
            <AvatarFace
              avatar={avatar}
              name={displayName || email || ""}
              size={52}
              // L'initiale vit sur l'accent ; les animaux sur le fond doux.
              background={avatar === "letter" ? colors.accent : colors.accentMuted}
              color={colors.onAccent}
            />
          )}
          <View style={styles.headerTextBox}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                {isGuest ? "Invité" : displayName.trim() || "Mon profil"}
              </Text>
              {plan === "founder" ? (
                <View style={[styles.planBadge, { backgroundColor: colors.ink }]}>
                  <Text style={[styles.planBadgeLabel, { color: colors.onInk }]}>VIP</Text>
                </View>
              ) : plan === "premium" ? (
                <View style={[styles.planBadge, { backgroundColor: colors.ink }]}>
                  <Text style={[styles.planBadgeLabel, { color: colors.onInk }]}>Premium</Text>
                </View>
              ) : null}
            </View>
            <Text
              style={[styles.headerMeta, { color: isGuest ? colors.shiftCp : colors.textMuted }]}
              numberOfLines={1}
            >
              {isGuest ? "1 scan / semaine" : (email ?? "")}
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {isGuest ? (
            <View
              style={[
                styles.upgradeCard,
                { backgroundColor: colors.surface, borderColor: colors.accent },
              ]}
            >
              <View style={styles.upgradeTitleBox}>
                <Text style={[styles.upgradeTitle, { color: colors.text }]}>Crée ton compte gratuit</Text>
                <Text style={[styles.upgradeSubtitle, { color: colors.textMuted }]}>
                  Tes plannings conservés · partage débloqué
                </Text>
              </View>
              <TextField label="Email" autoCapitalize="none" keyboardType="email-address" placeholder="sarah@exemple.fr" value={upgradeEmail} onChangeText={setUpgradeEmail} />
              <TextField label="Mot de passe" secureToggle placeholder="8 caractères minimum" value={upgradePassword} onChangeText={setUpgradePassword} />
              <Button label="Créer mon compte" onPress={handleUpgrade} isLoading={isUpgrading} />
              <Text style={[styles.upgradeFootnote, { color: colors.textDisabled }]}>
                Gratuit — tout ce que tu as déjà ajouté est conservé.
              </Text>
            </View>
          ) : null}

          {/* Destinations v2 : dot couleur (maquette 4c), Compte masqué en invité */}
          <NavRow
            dot={colors.accent}
            title="Scan & horaires"
            subtitle="Nom sur le planning · créneaux types · pause"
            onPress={() => router.push("/profile/planning")}
          />
          <NavRow
            dot={colors.shiftCp}
            title="Partage & suivi"
            subtitle="Mon code · plannings suivis · équipe"
            onPress={() => router.push("/profile/sharing")}
          />
          <NavRow
            dot={colors.shiftMeeting}
            title="Notifications"
            subtitle="Veille · matin · rappel scan hebdo"
            onPress={() => router.push("/profile/notifications")}
          />
          <NavRow
            dot={colors.success}
            title="Apparence"
            subtitle="Thème · icône de l’app · widgets"
            onPress={() => router.push("/profile/theme")}
          />
          {!isGuest ? (
            <NavRow
              dot={colors.textSoft}
              title="Compte"
              subtitle="Email · mot de passe · code VIP · suppression"
              onPress={() => router.push("/profile/account")}
            />
          ) : null}

        </ScrollView>

        {/* Pied FERRÉ EN BAS (demande Kylian) : déconnexion + signature. */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
          {isGuest ? (
            <View
              style={[
                styles.dangerCard,
                { backgroundColor: colors.surface, borderColor: colors.dangerBorder },
              ]}
            >
              <Text style={[styles.dangerText, { color: colors.textMuted }]}>
                Sans compte, te déconnecter effacera définitivement tes plannings
                sur cet appareil.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={handleSignOut}
                style={({ pressed }) => [
                  styles.dangerButton,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.dangerBorder,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text style={[styles.dangerButtonLabel, { color: colors.danger }]}>
                  Se déconnecter quand même
                </Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={handleSignOut} style={styles.signOutRow} hitSlop={8}>
              <Text style={[styles.signOutLabel, { color: colors.textMuted }]}>Se déconnecter</Text>
            </Pressable>
          )}

          <Text style={[styles.poweredBy, { color: colors.textDisabled }]}>
            Propulsé par KYKS · v{APP_VERSION}
          </Text>
        </View>
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
    gap: 14,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  closeButton: {
    width: 36,
    height: 36,
    // Maquette : la croix est un CARRÉ arrondi (le chevron retour reste rond).
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
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
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 2,
  },
  planBadgeLabel: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.bold,
    letterSpacing: 0.3,
  },
  headerMeta: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
  },
  content: {
    padding: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: 10,
  },
  upgradeCard: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: spacing.md + 2,
    gap: 12,
  },
  upgradeTitleBox: { gap: 2 },
  upgradeTitle: {
    fontSize: typeScale.body + 1.5,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.heading,
  },
  upgradeSubtitle: { fontSize: typeScale.caption, fontFamily: fonts.medium },
  upgradeFootnote: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.medium,
    textAlign: "center",
  },
  dangerCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    gap: 9,
    marginTop: spacing.sm,
  },
  dangerText: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
    lineHeight: 18,
  },
  dangerButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  dangerButtonLabel: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
  },
  signOutRow: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
  signOutLabel: { fontSize: 13, fontFamily: fonts.semiBold },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: 4,
  },
  poweredBy: {
    fontSize: 11.5,
    fontFamily: fonts.medium,
    textAlign: "center",
  },
});
