import { Ionicons } from "@expo/vector-icons";
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

import { Section } from "@/components/profile/Section";
import { SubPageHeader } from "@/components/profile/SubPageHeader";
import { fonts, radius, spacing, typeScale, useThemeColors } from "@/constants/tokens";
import { followUser, listFollowed, unfollowUser, type FollowedUser } from "@/lib/follow-service";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

export default function SharingSettingsScreen() {
  const colors = useThemeColors();
  const { session } = useAuth();

  const [followCode, setFollowCode] = useState("");
  const [followInput, setFollowInput] = useState("");
  const [followed, setFollowed] = useState<FollowedUser[]>([]);

  const userId = session?.user.id;

  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("profiles")
      .select("follow_code")
      .eq("id", userId)
      .single<{ follow_code: string }>();
    if (data) setFollowCode(data.follow_code ?? "");
    listFollowed().then(setFollowed);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleShareFollowCode() {
    await Share.share({
      message:
        `Suis mon planning sur Clork 💛 Ouvre Profil → « Suivre un planning » et saisis mon code : ${followCode.toUpperCase()}`,
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

  function handleUnfollow(user: FollowedUser) {
    Alert.alert("Ne plus suivre ?", user.displayName, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Ne plus suivre",
        style: "destructive",
        onPress: async () => {
          await unfollowUser(user.id);
          listFollowed().then(setFollowed);
        },
      },
    ]);
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

          <Section
            icon="heart"
            iconBg={colors.shiftMeetingSoft}
            iconColor={colors.shiftMeeting}
            title="Mon code de suivi"
            subtitle="Ton/ta partenaire voit ton planning en lecture seule"
          >
            <View style={styles.codeRow}>
              <Text style={[styles.codeValue, { color: colors.text, backgroundColor: colors.surfaceMuted }]}>
                {followCode.toUpperCase()}
              </Text>
              <Pressable
                onPress={handleShareFollowCode}
                accessibilityLabel="Partager mon code de suivi"
                style={[styles.codeShare, { backgroundColor: colors.accent }]}
              >
                <Ionicons name="share-outline" size={18} color={colors.onAccent} />
              </Pressable>
            </View>
          </Section>

          <Section
            icon="eye"
            iconBg={colors.shiftRhSoft}
            iconColor={colors.shiftRh}
            title="Suivre un planning"
            subtitle="Saisis le code reçu — le planning apparaîtra dans l'onglet Planning"
          >
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
              <Pressable
                onPress={handleFollow}
                disabled={!followInput.trim()}
                accessibilityLabel="Suivre ce code"
                style={[styles.codeShare, { backgroundColor: colors.accent, opacity: followInput.trim() ? 1 : 0.4 }]}
              >
                <Ionicons name="arrow-forward" size={18} color={colors.onAccent} />
              </Pressable>
            </View>
            {followed.map((f) => (
              <View key={f.id} style={styles.followedRow}>
                <Text style={[styles.followedName, { color: colors.text }]}>{f.displayName}</Text>
                <Pressable
                  onPress={() => handleUnfollow(f)}
                  hitSlop={8}
                  accessibilityLabel={`Ne plus suivre ${f.displayName}`}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              </View>
            ))}
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
  codeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  codeValue: {
    flex: 1,
    fontSize: typeScale.heading,
    fontFamily: fonts.extraBold,
    letterSpacing: 3,
    textAlign: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  codeShare: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  followInput: {
    flex: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    fontSize: typeScale.body,
    fontFamily: fonts.bold,
    letterSpacing: 2,
  },
  followedRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.xs },
  followedName: { fontSize: typeScale.body, fontFamily: fonts.bold },
});
