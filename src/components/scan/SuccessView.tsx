import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { fonts, letterSpacing, spacing, typeScale, useThemeColors } from "@/constants/tokens";

// Écran de succès du wizard (maquette 4b, dernier écran) : cercle ✓, confettis
// DISCRETS (5 particules, une seule salve), haptique légère, stats, 4 actions.

type SuccessViewProps = {
  slotCount: number;
  totalHours: number;
  onSeeWeek: () => void;
  onExport: () => void;
  onShare: () => void;
  onUndo: () => void;
};

const PARTICLES = [
  { dx: -70, dy: -90, delay: 0 },
  { dx: 60, dy: -110, delay: 60 },
  { dx: -30, dy: -130, delay: 120 },
  { dx: 90, dy: -70, delay: 40 },
  { dx: -100, dy: -50, delay: 100 },
] as const;

function Particle({
  dx,
  dy,
  delay,
  color,
}: {
  dx: number;
  dy: number;
  delay: number;
  color: string;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 700,
      delay,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [progress, delay]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.particle,
        {
          backgroundColor: color,
          opacity: progress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, 1, 0] }),
          transform: [
            { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
          ],
        },
      ]}
    />
  );
}

export function SuccessView({
  slotCount,
  totalHours,
  onSeeWeek,
  onExport,
  onShare,
  onUndo,
}: SuccessViewProps) {
  const colors = useThemeColors();
  const scale = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
  }, [scale]);

  return (
    <View style={styles.container}>
      <View style={styles.heroBox}>
        {PARTICLES.map((p, i) => (
          <Particle key={i} {...p} color={i % 2 === 0 ? colors.accent : colors.accentSoft} />
        ))}
        <Animated.View
          style={[styles.checkCircle, { backgroundColor: colors.accent, transform: [{ scale }] }]}
        >
          <Ionicons name="checkmark" size={44} color={colors.onAccent} />
        </Animated.View>
      </View>

      <Text style={[styles.title, { color: colors.text }]}>Semaine enregistrée</Text>
      <Text style={[styles.stats, { color: colors.textMuted }]}>
        {slotCount} créneau{slotCount > 1 ? "x" : ""} ajouté{slotCount > 1 ? "s" : ""} ·{" "}
        <Text style={[styles.statsHours, { color: colors.accent }]}>
          {totalHours.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}h payées
        </Text>
      </Text>

      <View style={styles.actions}>
        <Button label="Voir ma semaine" onPress={onSeeWeek} />
        <Button label="Exporter vers mon calendrier" variant="secondary" onPress={onExport} />
        <Button label="Partager le code à l'équipe" variant="secondary" onPress={onShare} />
        <Button label="Annuler cet import" variant="ghost" onPress={onUndo} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    // Coussin bas : les actions ne collent jamais au bord de l'écran.
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  heroBox: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  checkCircle: {
    width: 96,
    height: 96,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  particle: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  title: {
    fontSize: typeScale.title,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.title,
  },
  stats: {
    fontSize: typeScale.body,
    fontFamily: fonts.medium,
    marginBottom: spacing.lg,
  },
  statsHours: {
    fontFamily: fonts.bold,
  },
  actions: {
    alignSelf: "stretch",
    gap: spacing.sm,
  },
});
