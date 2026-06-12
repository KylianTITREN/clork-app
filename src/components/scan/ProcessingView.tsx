import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { spacing, typeScale, useThemeColors } from "@/constants/tokens";

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
  "Les corrections au stylo priment sur l'imprimé ✍️",
  "Détection des RH, CP et jours de repos…",
  "Lecture des post-its et notes en bas de page…",
  "Vérification des totaux d'heures…",
  "Encore quelques secondes, la précision se mérite ☕",
];

const HINT_INTERVAL_MS = 9000;

type ProcessingViewProps = {
  currentStep: ProcessingStep;
};

export function ProcessingView({ currentStep }: ProcessingViewProps) {
  const colors = useThemeColors();
  const [hintIndex, setHintIndex] = useState(0);

  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);

  useEffect(() => {
    if (currentStep !== "extract") return;
    const interval = setInterval(
      () => setHintIndex((i) => (i + 1) % EXTRACT_HINTS.length),
      HINT_INTERVAL_MS,
    );
    return () => clearInterval(interval);
  }, [currentStep]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.accent} />
      <View style={styles.steps}>
        {STEPS.map((step, index) => {
          const isDone = index < currentIndex;
          const isCurrent = index === currentIndex;
          return (
            <View key={step.key} style={styles.stepRow}>
              <Ionicons
                name={isDone ? "checkmark-circle" : isCurrent ? "ellipse" : "ellipse-outline"}
                size={20}
                color={isDone ? colors.success : isCurrent ? colors.accent : colors.textMuted}
              />
              <Text
                style={[
                  styles.stepLabel,
                  { color: isCurrent ? colors.text : colors.textMuted },
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
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          {EXTRACT_HINTS[hintIndex]}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xl,
    paddingHorizontal: spacing.xl,
  },
  steps: {
    gap: spacing.md,
    alignSelf: "stretch",
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  stepLabel: {
    fontSize: typeScale.body,
  },
  stepLabelCurrent: {
    fontWeight: "700",
  },
  hint: {
    fontSize: typeScale.caption,
    textAlign: "center",
    fontStyle: "italic",
  },
});
