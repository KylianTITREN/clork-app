// Mode conjoint — « Plannings suivis » (maquette 4c) : liste des plannings
// suivis en lecture seule, toggle « Afficher ce planning par défaut » (un
// seul — l'accueil et les widgets s'ouvrent dessus), « Ne plus suivre ».
// Le suivi saute si la personne régénère son code.

import { Ionicons } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SubPageHeader } from "@/components/profile/SubPageHeader";
import {
  fonts,
  radius,
  spacing,
  typeScale,
  useThemeColors,
} from "@/constants/tokens";
import {
  listFollowed,
  setDefaultView,
  unfollowUser,
  type FollowedUser,
} from "@/lib/follow-service";

export default function FollowedPlanningsScreen() {
  const colors = useThemeColors();
  const [followed, setFollowed] = useState<FollowedUser[]>([]);

  const reload = useCallback(() => {
    listFollowed().then(setFollowed);
  }, []);

  useFocusEffect(reload);

  async function toggleDefault(user: FollowedUser, next: boolean) {
    // Optimiste : un seul défaut à la fois.
    setFollowed((current) =>
      current.map((f) => ({ ...f, isDefaultView: next && f.id === user.id })),
    );
    try {
      await setDefaultView(next ? user.id : null);
    } catch (error) {
      reload();
      Alert.alert("Impossible", error instanceof Error ? error.message : "Erreur inconnue");
    }
  }

  function confirmUnfollow(user: FollowedUser) {
    Alert.alert(
      `Ne plus suivre ${user.displayName} ?`,
      "Tu ne verras plus son planning. Tu pourras le re-suivre avec son code.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Ne plus suivre",
          style: "destructive",
          onPress: async () => {
            await unfollowUser(user.id);
            reload();
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <SubPageHeader title="Plannings suivis" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {followed.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="people-outline" size={22} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              Tu ne suis encore personne. Saisis le code d'un·e proche dans
              Partage & suivi pour voir son planning ici.
            </Text>
          </View>
        ) : (
          followed.map((user) => (
            <View
              key={user.id}
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.avatar, { backgroundColor: colors.accentMuted }]}>
                  <Text style={[styles.avatarLetter, { color: colors.accent }]}>
                    {user.displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.cardText}>
                  <Text style={[styles.cardName, { color: colors.text }]}>{user.displayName}</Text>
                  <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
                    Lecture seule — {user.displayName} partage son planning avec toi
                  </Text>
                </View>
              </View>

              <View style={[styles.defaultRow, { borderTopColor: colors.separator }]}>
                <View style={styles.defaultText}>
                  <Text style={[styles.defaultLabel, { color: colors.text }]}>
                    Afficher ce planning par défaut
                  </Text>
                  <Text style={[styles.defaultHint, { color: colors.textMuted }]}>
                    L'app et les widgets s'ouvrent sur ce planning au lieu du tien.
                  </Text>
                </View>
                <Switch
                  value={user.isDefaultView}
                  onValueChange={(next) => toggleDefault(user, next)}
                  trackColor={{ true: colors.accent, false: colors.surfaceMuted }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <Pressable onPress={() => confirmUnfollow(user)} hitSlop={6} style={styles.unfollowRow}>
                <Text style={[styles.unfollowLabel, { color: colors.danger }]}>Ne plus suivre</Text>
              </Pressable>
            </View>
          ))
        )}
        <Text style={[styles.footNote, { color: colors.textMuted }]}>
          Le suivi s'interrompt si la personne régénère son code de suivi.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  emptyCard: {
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  emptyText: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
    textAlign: "center",
    lineHeight: 20,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm + 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    fontSize: typeScale.body,
    fontFamily: fonts.bold,
  },
  cardText: { flex: 1, gap: 2 },
  cardName: {
    fontSize: typeScale.body,
    fontFamily: fonts.bold,
  },
  cardMeta: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
  },
  defaultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderTopWidth: 1,
    paddingTop: spacing.sm + 2,
  },
  defaultText: { flex: 1, gap: 2 },
  defaultLabel: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
  },
  defaultHint: {
    fontSize: typeScale.caption,
    fontFamily: fonts.regular,
  },
  unfollowRow: {
    alignSelf: "flex-start",
  },
  unfollowLabel: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
  },
  footNote: {
    fontSize: typeScale.caption,
    fontFamily: fonts.regular,
    textAlign: "center",
  },
});
