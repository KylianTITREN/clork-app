// Porte Premium v2 (maquette 4e) : bottom sheet — icône étoile, bénéfices,
// « J'ai un code d'accès » → Profil → Compte, « Plus tard ». Montée une fois
// dans le layout (tabs) et pilotée par showPremiumGate() via le pont du
// plan-service (plus d'Alert native).

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import {
  fonts,
  letterSpacing,
  radius,
  spacing,
  typeScale,
  useThemeColors,
} from "@/constants/tokens";
import { setPremiumGateListener } from "@/lib/plan-service";

const BENEFITS = [
  "Scans illimités",
  "Export calendrier (Google / Apple / Outlook)",
  "Planning de toute l'équipe + partage par code",
  "Thèmes & créneaux types illimités",
] as const;

export function PremiumGateSheet() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [feature, setFeature] = useState<string | null>(null);

  useEffect(() => {
    setPremiumGateListener(setFeature);
    return () => setPremiumGateListener(null);
  }, []);

  if (!feature) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => setFeature(null)}>
      <Pressable style={styles.backdrop} onPress={() => setFeature(null)} />
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.md },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: colors.surfaceMuted }]} />

        <View style={[styles.iconBadge, { backgroundColor: colors.accent }]}>
          <Ionicons name="star" size={22} color={colors.onAccent} />
        </View>

        <Text style={[styles.title, { color: colors.text }]}>Fonction Premium</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {feature} est réservé aux membres Premium.
        </Text>

        <View style={[styles.benefits, { backgroundColor: colors.background, borderColor: colors.border }]}>
          {BENEFITS.map((benefit) => (
            <View key={benefit} style={styles.benefitRow}>
              <Ionicons name="checkmark" size={16} color={colors.accent} />
              <Text style={[styles.benefitText, { color: colors.textSoft }]}>{benefit}</Text>
            </View>
          ))}
        </View>

        <Button
          style={{ alignSelf: "stretch" }}
          label="J'ai un code d'accès"
          onPress={() => {
            setFeature(null);
            router.push("/profile/account");
          }}
        />
        <Pressable onPress={() => setFeature(null)} hitSlop={8}>
          <Text style={[styles.later, { color: colors.textMuted }]}>Plus tard</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(23,21,14,0.4)",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    alignItems: "center",
    gap: spacing.sm + 2,
    overflow: "hidden",
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: spacing.xs,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
  },
  title: {
    fontSize: typeScale.heading,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.heading,
  },
  subtitle: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
  benefits: {
    alignSelf: "stretch",
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm + 2,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
  },
  benefitText: {
    flex: 1,
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
  },
  later: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
    paddingVertical: spacing.xs,
  },
});
