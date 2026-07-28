// Partage & suivi v2 (maquettes 4d de Kylian) :
// - CONNECTÉ : carte SOMBRE « MON CODE DE SUIVI » (code géant vert clair,
//   « Envoyer mon code ») · « Suivre un planning » (raccourci accueil, liste
//   des suivis → écran Plannings suivis) · « Code équipe de la semaine »
//   (code affiché + bouton encre « Partager »).
// - SANS COMPTE : « Suivre un planning » EN PREMIER (aucun compte nécessaire),
//   « Mon code de suivi » neutralisé (hachures, ••••••, CTA compte),
//   « Code équipe » grisé 🔒.

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

import { Button } from "@/components/ui/Button";
import {
  fonts,
  letterSpacing,
  radius,
  spacing,
  typeScale,
  useThemeColors,
} from "@/constants/tokens";
import { followUser, listFollowed, type FollowedUser } from "@/lib/follow-service";
import { fetchPlan, isPremiumPlan, showPremiumGate, usePlan } from "@/lib/plan-service";
import { createShare } from "@/lib/share-service";
import { mondayOf } from "@/lib/dates";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

/**
 * Fond à rayures diagonales de la carte neutralisée (maquette 4d invité).
 * Views pivotées (pas de Pattern SVG : rendu partiel sur certaines versions) :
 * un grand carré -45° de bandes horizontales, rogné par la carte.
 */
const HATCH_SIZE = 900;
const HATCH_STRIPE = 16;
const HATCH_GAP = 18;

function HatchedBackground() {
  const rowCount = Math.ceil(HATCH_SIZE / (HATCH_STRIPE + HATCH_GAP));
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.hatchClip]}>
      <View style={styles.hatchCanvas}>
        {Array.from({ length: rowCount }, (_, index) => (
          <View key={index} style={styles.hatchStripe} />
        ))}
      </View>
    </View>
  );
}

export default function SharingSettingsScreen() {
  const colors = useThemeColors();
  const { session } = useAuth();

  const [followCode, setFollowCode] = useState("");
  const [followInput, setFollowInput] = useState("");
  const [followed, setFollowed] = useState<FollowedUser[]>([]);
  const [teamCode, setTeamCode] = useState<string | null>(null);

  const userId = session?.user.id;
  const isGuest = session?.user.is_anonymous ?? false;
  const plan = usePlan();
  const isPremium = isPremiumPlan(plan);

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
    if (!isGuest) {
      // Code équipe : scan validé de la semaine → code affiché directement.
      const { data: scan } = await supabase
        .from("scans")
        .select("id")
        .eq("uploader_id", userId)
        .eq("week_start", mondayOf(new Date()))
        .eq("status", "validated")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string }>();
      if (scan?.id) {
        createShare(scan.id)
          .then(setTeamCode)
          .catch(() => setTeamCode(null));
      } else {
        setTeamCode(null);
      }
    }
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
    if (!teamCode) return;
    if (!isPremiumPlan(await fetchPlan())) {
      showPremiumGate("Le partage de planning par code");
      return;
    }
    await Share.share({
      message:
        `Récupère tes horaires sur Clork sans re-scanner le planning ! ` +
        `Ouvre l'app → Ajouter → « J'ai reçu un code » et saisis : ${teamCode.toUpperCase()}`,
    });
  }

  const followCard = (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.cardTitle, { color: colors.text }]}>Suivre un planning</Text>
      <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
        {isGuest
          ? "Saisis le code reçu — aucun compte nécessaire"
          : "Il apparaîtra en raccourci sur ton accueil"}
      </Text>
      <View style={styles.codeRow}>
        <TextInput
          value={followInput}
          onChangeText={setFollowInput}
          placeholder="CODE REÇU"
          placeholderTextColor={colors.textDisabled}
          autoCapitalize="characters"
          autoCorrect={false}
          style={[styles.followInput, { backgroundColor: colors.background, color: colors.text }]}
        />
        <Pressable
          onPress={handleFollow}
          disabled={!followInput.trim()}
          accessibilityLabel="Suivre ce code"
          style={[
            styles.followGo,
            { backgroundColor: colors.accent, opacity: followInput.trim() ? 1 : 0.4 },
          ]}
        >
          <Ionicons name="arrow-forward" size={18} color={colors.onAccent} />
        </Pressable>
      </View>
      {followed.map((user) => (
        <Pressable
          key={user.id}
          onPress={() =>
            router.push({
              pathname: "/profile/suivis",
              params: { personId: user.id },
            } as Parameters<typeof router.push>[0])
          }
          style={[styles.followedRow, { backgroundColor: colors.background }]}
        >
          <View style={[styles.followedAvatar, { backgroundColor: colors.accentMuted }]}>
            <Text style={[styles.followedInitial, { color: colors.accent }]}>
              {user.displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.followedName, { color: colors.text }]} numberOfLines={1}>
            {user.displayName}
          </Text>
          <Text style={[styles.followedMeta, { color: colors.textMuted }]}>
            {user.isDefaultView ? "suivie · vue par défaut" : "suivie"}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.textDisabled} />
        </Pressable>
      ))}
    </View>
  );

  return (
    <SafeAreaView edges={["top"]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* En-tête : retour carré + titre (+ « Sans compte » en invité). */}
          <View style={styles.header}>
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : router.navigate("/(tabs)/profile"))}
              hitSlop={12}
              accessibilityLabel="Retour"
              style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Ionicons name="chevron-back" size={20} color={colors.text} />
            </Pressable>
            <View>
              <Text style={[styles.title, { color: colors.text }]}>Partage & suivi</Text>
              {isGuest ? (
                <Text style={[styles.titleSub, { color: colors.textMuted }]}>Sans compte</Text>
              ) : null}
            </View>
          </View>

          {isGuest ? (
            <>
              {followCard}

              {/* Mon code — neutralisé (hachures) */}
              <View style={[styles.hatchedCard, { borderColor: colors.border }]}>
                <HatchedBackground />
                <Text style={[styles.darkKicker, { color: colors.textMuted }]}>
                  MON CODE DE SUIVI
                </Text>
                <Text style={[styles.maskedCode, { color: colors.textDisabled }]}>• • • • • •</Text>
                <Text style={[styles.hatchedText, { color: colors.textMuted }]}>
                  Pour partager TON planning, il faut un compte —{"\n"}c'est lui qui héberge ton code.
                </Text>
                <Button
                  label="Créer mon compte gratuit"
                  variant="dark"
                  style={{ alignSelf: "stretch" }}
                  // Parcours d'inscription invité 3 étapes ; retour = cette page.
                  onPress={() => router.push("/upgrade" as Parameters<typeof router.push>[0])}
                />
              </View>

              {/* Code équipe — verrouillé */}
              <View
                style={[
                  styles.card,
                  styles.lockedCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <View style={styles.lockedRow}>
                  <View style={styles.lockedText}>
                    <Text style={[styles.cardTitle, { color: colors.textMuted }]}>
                      Code équipe de la semaine
                    </Text>
                    <Text style={[styles.cardSubtitle, { color: colors.textDisabled }]}>
                      Disponible avec un compte
                    </Text>
                  </View>
                  <View style={[styles.lockBadge, { backgroundColor: colors.background }]}>
                    <Ionicons name="lock-closed" size={13} color={colors.textDisabled} />
                  </View>
                </View>
              </View>
            </>
          ) : (
            <>
              {/* Carte sombre : mon code */}
              <View style={[styles.darkCard, { backgroundColor: colors.ink }]}>
                <Text style={[styles.darkKicker, { color: colors.onInk, opacity: 0.6 }]}>
                  MON CODE DE SUIVI
                </Text>
                <Text style={[styles.darkCode, { color: colors.accentSoft }]}>
                  {followCode ? followCode.toUpperCase().split("").join(" ") : "· · · · · ·"}
                </Text>
                <Text style={[styles.darkHint, { color: colors.onInk, opacity: 0.65 }]}>
                  Ton/ta partenaire le saisit une fois —{"\n"}ton planning apparaît chez lui/elle, en
                  lecture seule.
                </Text>
                <Button
                  label="Envoyer mon code"
                  style={{ alignSelf: "stretch" }}
                  onPress={handleShareFollowCode}
                />
              </View>

              {followCard}

              {/* Code équipe */}
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>
                  Code équipe de la semaine
                </Text>
                <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
                  Tes collègues récupèrent leurs horaires sans re-scanner
                </Text>
                {teamCode ? (
                  isPremium ? (
                    <View style={[styles.teamRow, { backgroundColor: colors.background }]}>
                      <Text style={[styles.teamCode, { color: colors.text }]}>
                        {teamCode.toUpperCase()}
                      </Text>
                      <Pressable
                        onPress={handleShareTeamCode}
                        style={[styles.teamShare, { backgroundColor: colors.ink }]}
                      >
                        <Text style={[styles.teamShareLabel, { color: colors.onInk }]}>Partager</Text>
                      </Pressable>
                    </View>
                  ) : (
                    // Verrou Premium (maquette 4e) : le code n'est jamais lisible.
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => showPremiumGate("Le partage de planning par code")}
                      style={[styles.premiumBanner, { backgroundColor: colors.background }]}
                    >
                      <Text style={[styles.premiumBannerText, { color: colors.textSoft }]}>
                        Le partage par code est une fonction Premium
                      </Text>
                      <Text style={[styles.premiumBannerCta, { color: colors.accent }]}>
                        Débloquer ›
                      </Text>
                    </Pressable>
                  )
                ) : (
                  <Text style={[styles.cardSubtitle, { color: colors.textDisabled }]}>
                    Scanne et valide le planning de la semaine pour l'activer.
                  </Text>
                )}
              </View>
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
  content: { padding: spacing.lg, gap: spacing.md - 4 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: typeScale.title - 4,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.title,
  },
  titleSub: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md + 2,
    gap: spacing.sm + 2,
  },
  cardTitle: {
    fontSize: typeScale.body,
    fontFamily: fonts.bold,
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
    marginTop: -6,
  },
  codeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  followInput: {
    flex: 1,
    borderRadius: radius.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 5,
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
    letterSpacing: 2,
  },
  followGo: {
    width: 46,
    height: 46,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  followedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    borderRadius: radius.input,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm + 2,
  },
  followedAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  followedInitial: {
    fontSize: typeScale.caption,
    fontFamily: fonts.bold,
  },
  followedName: {
    flex: 1,
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
  },
  followedMeta: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.medium,
  },
  hatchClip: {
    overflow: "hidden",
    borderRadius: radius.lg,
    backgroundColor: "#FFFFFF",
  },
  hatchCanvas: {
    position: "absolute",
    width: HATCH_SIZE,
    height: HATCH_SIZE,
    left: "50%",
    top: "50%",
    marginLeft: -HATCH_SIZE / 2,
    marginTop: -HATCH_SIZE / 2,
    transform: [{ rotate: "-45deg" }],
    gap: HATCH_GAP,
  },
  hatchStripe: {
    height: HATCH_STRIPE,
    backgroundColor: "#F4F2EC",
    opacity: 0.55,
  },
  hatchedCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.sm + 2,
    overflow: "hidden",
  },
  maskedCode: {
    fontSize: typeScale.heading,
    fontFamily: fonts.bold,
    letterSpacing: 4,
  },
  hatchedText: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
    textAlign: "center",
    lineHeight: 18,
  },
  lockedCard: {
    opacity: 0.75,
  },
  lockedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  lockedText: { flex: 1, gap: spacing.sm + 2 },
  lockBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  darkCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.sm + 2,
  },
  darkKicker: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
    letterSpacing: 1,
  },
  darkCode: {
    fontSize: 34,
    fontFamily: fonts.bold,
    letterSpacing: 2,
  },
  darkHint: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
    textAlign: "center",
    lineHeight: 18,
  },
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    borderRadius: radius.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  teamCode: {
    fontSize: typeScale.body,
    fontFamily: fonts.bold,
    letterSpacing: 2,
  },
  teamShare: {
    borderRadius: 9,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  teamShareLabel: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
  },
  // Bandeau verrou (maquette 4e) : fond neutre r11, texte + « Débloquer › ».
  premiumBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    borderRadius: radius.input,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  premiumBannerText: {
    flex: 1,
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
  },
  premiumBannerCta: {
    fontSize: typeScale.caption,
    fontFamily: fonts.bold,
  },
});
