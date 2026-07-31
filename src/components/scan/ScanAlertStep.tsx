import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
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
import type { PlanningExtraction } from "@/lib/extraction-types";
import type { RowHoursCheck } from "@/lib/scan-service";

// Dernier filtre avant le récap. Deux signaux, un seul écran :
//   · la photo a été jugée difficile à lire par l'extraction ;
//   · la somme des jours lus ne retombe pas sur le total hebdo imprimé —
//     signature du décalage de lignes, où chacune hérite des horaires de sa
//     voisine du dessous sans que rien ne paraisse anormal jour par jour.
// On informe et on oriente ; l'import reste toujours possible.

type ScanAlertStepProps = {
  quality: PlanningExtraction["photo_quality"];
  /** null quand la ligne est cohérente : seule la qualité photo alerte. */
  hours: RowHoursCheck | null;
  employeeName: string;
  onContinue: () => void;
  /** Ouvre la file de correction jour par jour. */
  onReview: () => void;
  /** null quand le planning vient d'un code partagé : aucune photo à reprendre. */
  onRetake: (() => void) | null;
  isBusy?: boolean;
};

function formatHours(value: number): string {
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} h`;
}

export function ScanAlertStep({
  quality,
  hours,
  employeeName,
  onContinue,
  onReview,
  onRetake,
  isBusy = false,
}: ScanAlertStepProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const isUnusable = quality === "unusable";

  // Même vibration que les autres avertissements de l'app : l'écran arrive
  // après une longue attente, l'utilisatrice ne le regarde pas forcément.
  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, []);

  const title = hours
    ? "Le total ne tombe pas juste"
    : isUnusable
      ? "Photo trop difficile à lire"
      : "Photo difficile à lire";

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Rien n'est encore enregistré dans ton planning.
        </Text>

        {quality !== "good" ? (
          <View
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.cardIcon, { backgroundColor: colors.shiftCpSoft }]}>
                <Ionicons name="camera-outline" size={17} color={colors.shiftCp} />
              </View>
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                {isUnusable ? "Lecture peu fiable" : "La photo était difficile à lire"}
              </Text>
            </View>
            <Text style={[styles.cardText, { color: colors.textSoft }]}>
              {isUnusable
                ? "Le planning n'est pas assez net pour une lecture sûre. Mieux vaut reprendre la photo que corriger sept jours à la main."
                : "Vérifie bien tes horaires avant de valider, ou reprends une photo plus nette — c'est plus rapide que de tout corriger."}
            </Text>
          </View>
        ) : null}

        {hours ? (
          <View
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.cardIcon, { backgroundColor: colors.shiftCpSoft }]}>
                <Ionicons name="alert-circle-outline" size={17} color={colors.shiftCp} />
              </View>
              <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>
                Ligne de {employeeName}
              </Text>
            </View>

            {/* Les deux nombres côte à côte : c'est l'écart qui parle */}
            <View style={styles.compareRow}>
              <View style={[styles.compareBox, { backgroundColor: colors.background }]}>
                <Text style={[styles.compareLabel, { color: colors.textMuted }]}>Jours lus</Text>
                <Text style={[styles.compareValue, { color: colors.text }]}>
                  {formatHours(hours.readHours)}
                </Text>
              </View>
              <Text style={[styles.compareSign, { color: colors.shiftCp }]}>≠</Text>
              <View style={[styles.compareBox, { backgroundColor: colors.background }]}>
                <Text style={[styles.compareLabel, { color: colors.textMuted }]}>
                  Total imprimé
                </Text>
                <Text style={[styles.compareValue, { color: colors.text }]}>
                  {hours.printedHours != null ? formatHours(hours.printedHours) : "—"}
                </Text>
              </View>
            </View>

            <Text style={[styles.cardText, { color: colors.textSoft }]}>
              La somme des journées lues ne correspond pas au total imprimé sur ton planning.
              C'est le plus souvent le signe d'une ligne décalée : les horaires de la personne
              du dessous ont été recopiés sur la tienne.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Coussin bas : les CTA ne collent jamais au bord de l'écran */}
      <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.lg }]}>
        {hours ? (
          <>
            <Button label="Vérifier jour par jour" onPress={onReview} disabled={isBusy} />
            {onRetake ? (
              <Button
                label="Reprendre une photo"
                variant="secondary"
                onPress={onRetake}
                isLoading={isBusy}
              />
            ) : null}
            <Button
              label="Importer quand même"
              variant="ghost"
              onPress={onContinue}
              disabled={isBusy}
            />
          </>
        ) : isUnusable && onRetake ? (
          <>
            <Button label="Reprendre une photo" onPress={onRetake} isLoading={isBusy} />
            <Button
              label="Voir quand même ce qui a été lu"
              variant="ghost"
              onPress={onContinue}
              disabled={isBusy}
            />
          </>
        ) : (
          <>
            <Button label="Voir mes horaires" onPress={onContinue} disabled={isBusy} />
            {onRetake ? (
              <Button
                label="Reprendre une photo"
                variant="secondary"
                onPress={onRetake}
                isLoading={isBusy}
              />
            ) : null}
          </>
        )}
        {onRetake ? (
          <Text style={[styles.footNote, { color: colors.textMuted }]}>
            Reprendre jette la lecture actuelle — elle ne compte pas dans ton quota de scans.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  title: {
    fontSize: typeScale.title,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.title,
    marginTop: spacing.sm,
  },
  subtitle: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
    marginBottom: spacing.xs,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cardIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    flex: 1,
    fontSize: typeScale.body,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.heading,
  },
  cardText: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
    lineHeight: 20,
  },
  compareRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  compareBox: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    borderRadius: radius.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.sm,
  },
  compareLabel: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  compareValue: {
    fontSize: 22,
    fontFamily: fonts.bold,
    letterSpacing: -0.5,
  },
  compareSign: {
    fontSize: typeScale.heading,
    fontFamily: fonts.bold,
  },
  actions: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  footNote: {
    fontSize: 11.5,
    fontFamily: fonts.medium,
    textAlign: "center",
    marginTop: spacing.xs,
  },
});
