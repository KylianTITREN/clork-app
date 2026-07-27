// Partage & suivi v2 (maquette 4d) :
// - Connecté : carte SOMBRE « Mon code de suivi » (régénérable, envoyer),
//   « Suivre un planning » (champ code + lien plannings suivis), « Code équipe
//   de la semaine » (récupérer ses horaires d'un scan commun sans re-scanner).
// - Invité : seul « Suivre un planning » est actif ; « Mon code » est
//   neutralisé (il faut un compte — c'est lui qui héberge le code) ; « Code
//   équipe » grisé 🔒.

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
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

import { NavRow } from "@/components/profile/NavRow";
import { Section } from "@/components/profile/Section";
import { SubPageHeader } from "@/components/profile/SubPageHeader";
import { fonts, radius, spacing, typeScale, useThemeColors } from "@/constants/tokens";
import { followUser, listFollowed, type FollowedUser } from "@/lib/follow-service";
import { fetchPlan, isPremiumPlan, showPremiumGate } from "@/lib/plan-service";
import { createShare } from "@/lib/share-service";
import { mondayOf } from "@/lib/dates";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

function randomFollowCode(): string {
  // 6 caractères lisibles (pas de 0/O ni 1/I).
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

export default function SharingSettingsScreen() {
  const colors = useThemeColors();
  const { session } = useAuth();

  const [followCode, setFollowCode] = useState("");
  const [followInput, setFollowInput] = useState("");
  const [followed, setFollowed] = useState<FollowedUser[]>([]);
  const [weekScanId, setWeekScanId] = useState<string | null>(null);

  const userId = session?.user.id;
  const isGuest = session?.user.is_anonymous ?? false;

  const load = useCallback(async () => {
    if (!userId) return;
    if (!isGuest) {
      const { data } = await supabase
        .from("profiles")
        .select("follow_code")
        .eq("id", userId)
        .single<{ follow_code: string }>();
      if (data) setFollowCode(data.follow_code ?? "");
    }
    listFollowed().then(setFollowed);
    // Scan validé de la semaine courante → source du code équipe.
    const { data: scan } = await supabase
      .from("scans")
      .select("id")
      .eq("uploader_id", userId)
      .eq("week_start", mondayOf(new Date()))
      .eq("status", "validated")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();
    setWeekScanId(scan?.id ?? null);
  }, [userId, isGuest]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleShareFollowCode() {
    await Share.share({
      message:
        `Suis mon planning sur Clork 💛 Ouvre Profil → Partage & suivi → « Suivre un planning » et saisis mon code : ${followCode.toUpperCase()}`,
    });
  }

  function handleRegenerate() {
    Alert.alert(
      "Régénérer mon code ?",
      "L'ancien code ne fonctionnera plus pour de nouveaux suivis.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Régénérer",
          onPress: async () => {
            if (!userId) return;
            const next = randomFollowCode();
            const { error } = await supabase
              .from("profiles")
              .update({ follow_code: next })
              .eq("id", userId);
            if (error) Alert.alert("Impossible", error.message);
            else setFollowCode(next);
          },
        },
      ],
    );
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

  async function handleShareTeamCode() {
    if (isGuest) return;
    if (!weekScanId) {
      Alert.alert(
        "Pas de scan cette semaine",
        "Scanne et valide le planning de la semaine pour générer le code équipe.",
      );
      return;
    }
    if (!isPremiumPlan(await fetchPlan())) {
      showPremiumGate("Le partage de planning par code");
      return;
    }
    try {
      const code = await createShare(weekScanId);
      await Share.share({
        message:
          `Récupère tes horaires sur Clork sans re-scanner le planning ! ` +
          `Ouvre l'app → Ajouter → « J'ai reçu un code » et saisis : ${code.toUpperCase()}`,
      });
    } catch (error) {
      Alert.alert("Partage impossible", error instanceof Error ? error.message : "Erreur inconnue");
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
          <SubPageHeader title="Partage & suivi" />

          {/* Carte sombre : mon code de suivi */}
          <View style={[styles.darkCard, { backgroundColor: colors.ink }]}>
            <Text style={[styles.darkKicker, { color: colors.onInk, opacity: 0.65 }]}>
              MON CODE DE SUIVI
            </Text>
            {isGuest ? (
              <>
                <Text style={[styles.darkCode, { color: colors.onInk, opacity: 0.4 }]}>••••••</Text>
                <Text style={[styles.darkHint, { color: colors.onInk, opacity: 0.7 }]}>
                  Il faut un compte — c'est lui qui héberge ton code.
                </Text>
                <Pressable
                  onPress={() => router.push("/profile")}
                  style={[styles.darkCta, { backgroundColor: colors.accent }]}
                >
                  <Text style={[styles.darkCtaLabel, { color: colors.onAccent }]}>
                    Créer mon compte gratuit
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.darkCodeRow}>
                  <Text style={[styles.darkCode, { color: colors.accentSoft }]}>
                    {followCode.toUpperCase() || "……"}
                  </Text>
                  <Pressable
                    onPress={handleRegenerate}
                    hitSlop={8}
                    accessibilityLabel="Régénérer mon code"
                    style={styles.regenButton}
                  >
                    <Ionicons name="refresh" size={17} color={colors.onInk} />
                  </Pressable>
                </View>
                <Text style={[styles.darkHint, { color: colors.onInk, opacity: 0.7 }]}>
                  Ton/ta partenaire voit ton planning en lecture seule.
                </Text>
                <Pressable
                  onPress={handleShareFollowCode}
                  style={[styles.darkCta, { backgroundColor: colors.accent }]}
                >
                  <Text style={[styles.darkCtaLabel, { color: colors.onAccent }]}>
                    Envoyer mon code
                  </Text>
                </Pressable>
              </>
            )}
          </View>

          {/* Suivre un planning — actif même sans compte */}
          <Section
            icon="eye"
            iconBg={colors.shiftRhSoft}
            iconColor={colors.shiftRh}
            title="Suivre un planning"
            subtitle="Saisis le code reçu — le planning apparaît sur ton accueil"
          >
            <View style={styles.codeRow}>
              <TextInput
                value={followInput}
                onChangeText={setFollowInput}
                placeholder="Code (ex: K7M2PX)"
                placeholderTextColor={colors.textDisabled}
                autoCapitalize="characters"
                autoCorrect={false}
                style={[
                  styles.followInput,
                  { backgroundColor: colors.background, borderColor: colors.border, color: colors.text },
                ]}
              />
              <Pressable
                onPress={handleFollow}
                disabled={!followInput.trim()}
                accessibilityLabel="Suivre ce code"
                style={[styles.codeShare, { backgroundColor: colors.accent, opacity: followInput.trim() ? 1 : 0.4 }]}
              >
                <Ionicons name="arrow-forward" size={18} color={colors.onAccent} />
              </Pressable>
            </View>
          </Section>

          {followed.length > 0 ? (
            <NavRow
              icon="people"
              iconBg={colors.accentMuted}
              iconColor={colors.accent}
              title="Plannings suivis"
              subtitle={`${followed.length} suivi${followed.length > 1 ? "s" : ""} · vue par défaut, ne plus suivre`}
              // Cast : la route typée est générée par Metro au prochain start.
              onPress={() => router.push("/profile/suivis" as Parameters<typeof router.push>[0])}
            />
          ) : null}

          {/* Code équipe de la semaine */}
          <Pressable
            onPress={handleShareTeamCode}
            disabled={isGuest}
            style={[
              styles.teamCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
              isGuest && { opacity: 0.5 },
            ]}
          >
            <View style={[styles.teamIcon, { backgroundColor: colors.accentMuted }]}>
              <Ionicons name={isGuest ? "lock-closed" : "people-outline"} size={18} color={colors.accent} />
            </View>
            <View style={styles.teamText}>
              <Text style={[styles.teamTitle, { color: colors.text }]}>Code équipe de la semaine</Text>
              <Text style={[styles.teamSub, { color: colors.textMuted }]}>
                {isGuest
                  ? "Compte requis pour partager le scan à l'équipe."
                  : weekScanId
                    ? "Tes collègues récupèrent leurs horaires sans re-scanner."
                    : "Scanne le planning de la semaine pour l'activer."}
              </Text>
            </View>
            <Ionicons name="share-outline" size={18} color={isGuest ? colors.textDisabled : colors.accent} />
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
  darkCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  darkKicker: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
    letterSpacing: 0.8,
  },
  darkCodeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  darkCode: {
    fontSize: 34,
    fontFamily: fonts.bold,
    letterSpacing: 6,
  },
  regenButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(247,246,242,0.12)",
  },
  darkHint: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
  },
  darkCta: {
    alignItems: "center",
    borderRadius: radius.sm,
    paddingVertical: 13,
    marginTop: spacing.xs,
  },
  darkCtaLabel: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
  },
  codeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  codeShare: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  followInput: {
    flex: 1,
    borderRadius: radius.input,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    fontSize: typeScale.body,
    fontFamily: fonts.bold,
    letterSpacing: 2,
  },
  teamCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  teamIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  teamText: { flex: 1, gap: 2 },
  teamTitle: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.bold,
  },
  teamSub: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
  },
});
