import { Ionicons } from "@expo/vector-icons";
import type { PropsWithChildren } from "react";
import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fonts, spacing, typeScale, useThemeColors } from "@/constants/tokens";

// Cadre des parcours par étapes v2 (wizard Ajouter, inscription) :
// barre de progression animée + « Étape x/y » + fermer/retour.
type WizardFrameProps = PropsWithChildren<{
  step: number; // 1-indexé
  totalSteps: number;
  onClose: () => void;
  /** chevron retour au lieu du ✕ (inscription) ; ✕ par défaut (wizard modal). */
  closeIcon?: "close" | "back";
  /** Libellé optionnel à droite (ex. « Passer »). */
  rightAction?: { label: string; onPress: () => void };
}>;

export function WizardFrame({
  step,
  totalSteps,
  onClose,
  closeIcon = "close",
  rightAction,
  children,
}: WizardFrameProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(step / totalSteps)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: step / totalSteps,
      duration: 260,
      useNativeDriver: false, // anime width (%) — pas compositable
    }).start();
  }, [progress, step, totalSteps]);

  return (
    // Padding manuel : en fullScreenModal, SafeAreaView laissait la croix
    // remonter dans la notch (retour utilisateur) — insets explicites.
    <View
      style={[
        styles.safeArea,
        { backgroundColor: colors.background, paddingTop: Math.max(insets.top, 12) + 4 },
      ]}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={closeIcon === "close" ? "Fermer" : "Retour"}
          onPress={onClose}
          hitSlop={12}
          style={[styles.closeButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons
            name={closeIcon === "close" ? "close" : "chevron-back"}
            size={20}
            color={colors.text}
          />
        </Pressable>
        <View style={styles.progressBox}>
          <View style={[styles.progressRail, { backgroundColor: colors.surfaceMuted }]}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  backgroundColor: colors.accent,
                  width: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0%", "100%"],
                  }),
                },
              ]}
            />
          </View>
          <Text style={[styles.stepLabel, { color: colors.textMuted }]}>
            Étape {step}/{totalSteps}
          </Text>
        </View>
        {rightAction ? (
          <Pressable onPress={rightAction.onPress} hitSlop={8}>
            <Text style={[styles.rightLabel, { color: colors.textMuted }]}>
              {rightAction.label}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.closeButton} />
        )}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  progressBox: {
    flex: 1,
    alignItems: "center",
    gap: 5,
  },
  progressRail: {
    alignSelf: "stretch",
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  stepLabel: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  rightLabel: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
  },
});
