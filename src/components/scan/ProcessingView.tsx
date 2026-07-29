import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

import { fonts, radius, spacing, typeScale, useThemeColors } from "@/constants/tokens";

export type ProcessingStep = "compress" | "upload" | "extract" | "save";

const STEPS: { key: ProcessingStep; label: string }[] = [
  { key: "compress", label: "Préparation de la photo" },
  { key: "upload", label: "Envoi sécurisé" },
  { key: "extract", label: "Lecture du planning par l'IA" },
  { key: "save", label: "Enregistrement" },
];

// L'extraction prend ~2 min : on occupe l'attente avec des messages qui tournent.
const EXTRACT_HINTS = [
  "L'IA repère les lignes du tableau…",
  "Lecture des horaires, ratures comprises…",
  "Les corrections au stylo priment sur l'imprimé…",
  "Détection des RH, CP et jours de repos…",
  "Lecture des post-its et notes en bas de page…",
  "Vérification des totaux d'heures…",
  "Encore quelques secondes, la précision se mérite…",
];

const HINT_INTERVAL_MS = 9000;

type ProcessingViewProps = {
  currentStep: ProcessingStep;
};

export function ProcessingView({ currentStep }: ProcessingViewProps) {
  const colors = useThemeColors();
  const [hintIndex, setHintIndex] = useState(0);
  // ~2 min d'attente : chaque changement était un à-coup. Le message se
  // remplace en fondu et le cadran respire au lieu de tourner en rond.
  const hintOpacity = useRef(new Animated.Value(1)).current;
  const breath = useRef(new Animated.Value(0)).current;

  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);

  useEffect(() => {
    if (currentStep !== "extract") return;
    const interval = setInterval(() => {
      // Fondu sortant, changement de texte à mi-course, fondu entrant.
      Animated.timing(hintOpacity, {
        toValue: 0,
        duration: 260,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        setHintIndex((i) => (i + 1) % EXTRACT_HINTS.length);
        Animated.timing(hintOpacity, {
          toValue: 1,
          duration: 320,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      });
    }, HINT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [currentStep, hintOpacity]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breath]);

  const breathStyle = {
    transform: [{ scale: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }],
    opacity: breath.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }),
  };

  return (
    <View style={styles.container}>
      <Animated.View
        style={[styles.heroCircle, { backgroundColor: colors.accentMuted }, breathStyle]}
      >
        <Ionicons name="scan" size={40} color={colors.accent} />
      </Animated.View>
      <View
        style={[styles.steps, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        {STEPS.map((step, index) => {
          const isDone = index < currentIndex;
          const isCurrent = index === currentIndex;
          return (
            <View key={step.key} style={styles.stepRow}>
              <Ionicons
                name={isDone ? "checkmark-circle" : isCurrent ? "ellipse" : "ellipse-outline"}
                size={20}
                color={
                  isDone ? colors.success : isCurrent ? colors.accent : colors.textDisabled
                }
              />
              <Text
                style={[
                  styles.stepLabel,
                  {
                    color: isDone
                      ? colors.textMuted
                      : isCurrent
                        ? colors.text
                        : colors.textDisabled,
                  },
                  isCurrent && styles.stepLabelCurrent,
                ]}
              >
                {step.label}
              </Text>
            </View>
          );
        })}
      </View>
      {currentStep === "extract" ? (
        <>
          <Animated.Text
            style={[styles.hint, { color: colors.textMuted, opacity: hintOpacity }]}
          >
            {EXTRACT_HINTS[hintIndex]}
          </Animated.Text>
          {/* La lecture tourne côté serveur : l'app peut être fermée, une
              notification push signale la fin (sendPushNotification), et la
              reprise propose le scan à valider (bannière d'accueil). */}
          <View
            style={[
              styles.backgroundNote,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Ionicons name="notifications-outline" size={18} color={colors.accent} />
            <Text style={[styles.backgroundNoteText, { color: colors.textSoft }]}>
              Pas besoin d'attendre ici : tu peux fermer l'app, on t'envoie une
              notification dès que ton planning est prêt à valider.
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  heroCircle: {
    width: 96,
    height: 96,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  steps: {
    gap: spacing.md,
    alignSelf: "stretch",
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  stepLabel: {
    fontSize: typeScale.body,
    fontFamily: fonts.medium,
  },
  stepLabelCurrent: {
    fontFamily: fonts.semiBold,
  },
  hint: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
    textAlign: "center",
    fontStyle: "italic",
  },
  backgroundNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    alignSelf: "stretch",
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  backgroundNoteText: {
    flex: 1,
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
  },
});
