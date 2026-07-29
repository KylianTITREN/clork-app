import { ScrollView, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import type { WizardDay } from "@/components/scan/RecapStep";
import {
  fonts,
  letterSpacing,
  radius,
  shiftTypeColor,
  shiftTypeLabel,
  shiftTypeSoftColor,
  spacing,
  typeScale,
  useThemeColors,
} from "@/constants/tokens";
import type { DraftShift } from "@/lib/scan-service";

// Correction jour par jour (maquette 4b, écran 3 « Vérifie tes jours ») :
// pastilles de progression (une par jour de la file), carte du jour (date
// longue + badge type, bandeau horaire géant, pause / heures payées), deux
// boutons « Corriger » et « C'est bon ✓ », encart rature manuscrite,
// compteur « x validé · plus que y » avec coussin bas.

const DAY_TITLE_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("fr-FR", { weekday: "long" });

type ReviewStepProps = {
  days: WizardDay[];
  drafts: DraftShift[];
  queue: string[]; // dates à corriger, dans l'ordre
  queueIndex: number;
  /** Ouvre l'écran « Corriger » sur le JOUR (tous ses créneaux). */
  onEditDay: (date: string) => void;
  onApprove: () => void;
};

type Slot = { draft: DraftShift; index: number };

function formatHours(value: number): string {
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}h`;
}

function formatBreak(minutes: number): string {
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h${minutes % 60 ? String(minutes % 60).padStart(2, "0") : ""}`
    : `${minutes} min`;
}

function spanOf(draft: DraftShift): number {
  if (!draft.start || !draft.end) return 0;
  const [sh, sm] = draft.start.split(":").map(Number);
  const [eh, em] = draft.end.split(":").map(Number);
  return (eh * 60 + em - sh * 60 - sm) / 60;
}

function paidOf(draft: DraftShift): number {
  return draft.durationHours ?? spanOf(draft);
}

/** Pause déduite (amplitude − durée payée), en minutes. */
function pauseOf(draft: DraftShift): number {
  return Math.max(0, Math.round((spanOf(draft) - paidOf(draft)) * 60));
}

/** « mercredi 29 juillet » → « Mercredi 29 Juillet » (capitalize maquette). */
function capitalizeWords(value: string): string {
  return value
    .split(" ")
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/** Pastilles M / V / M2 : initiale du jour, suffixée si l'initiale se répète. */
function progressPills(queue: string[]): { date: string; label: string }[] {
  const seen = new Map<string, number>();
  return queue.map((date) => {
    const letter = WEEKDAY_FORMATTER.format(new Date(`${date}T12:00:00`)).charAt(0).toUpperCase();
    const occurrence = (seen.get(letter) ?? 0) + 1;
    seen.set(letter, occurrence);
    return { date, label: occurrence > 1 ? `${letter}${occurrence}` : letter };
  });
}

export function ReviewStep({
  days,
  drafts,
  queue,
  queueIndex,
  onEditDay,
  onApprove,
}: ReviewStepProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const currentDate = queue[queueIndex];
  const day = days.find((d) => d.date === currentDate);
  const validated = queueIndex;
  const remaining = queue.length - queueIndex;
  const pills = progressPills(queue);

  const slots: Slot[] = day
    ? day.draftIndexes
        .map((i) => ({ draft: drafts[i], index: i }))
        .filter((slot): slot is Slot => Boolean(slot.draft))
    : [];
  // Un créneau retiré à la correction (include:false) ne s'affiche plus.
  const includedSlots = slots.filter(({ draft }) => draft.include);
  const timedSlots = includedSlots.filter(({ draft }) => draft.start && draft.end);
  // Type mis en badge : celui du créneau retenu, « Repos » si le jour n'en
  // garde aucun (repos lu, ou dernier créneau supprimé à la correction).
  const primarySlot = timedSlots[0] ?? includedSlots[0] ?? null;
  const badgeType = primarySlot?.draft.type ?? (slots.length > 0 ? "off" : null);
  const hasHandwriting = includedSlots.some(({ draft }) => draft.fromHandwriting);

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: colors.text }]}>Vérifie tes jours</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Tes jours sélectionnés, un par un — {queueIndex + 1} sur {queue.length}.
          </Text>
        </View>

        {/* Pastilles de progression : faite = encre atténuée, courante = encre */}
        <View style={styles.pillRow}>
          {pills.map((pill, position) => {
            const isDone = position < queueIndex;
            const isCurrent = position === queueIndex;
            return (
              <View
                key={pill.date}
                style={[
                  styles.pill,
                  isDone || isCurrent
                    ? { backgroundColor: colors.ink, borderColor: colors.ink, opacity: isDone ? 0.45 : 1 }
                    : { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <Text
                  style={[
                    styles.pillLabel,
                    isDone || isCurrent
                      ? [styles.pillLabelActive, { color: colors.onInk }]
                      : { color: colors.textDisabled },
                  ]}
                >
                  {pill.label}
                </Text>
              </View>
            );
          })}
        </View>

        {day ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.cardDate, { color: colors.text }]} numberOfLines={1}>
                {capitalizeWords(DAY_TITLE_FORMATTER.format(new Date(`${day.date}T12:00:00`)))}
              </Text>
              {badgeType ? (
                <View style={[styles.typeBadge, { backgroundColor: shiftTypeSoftColor[badgeType] }]}>
                  <Text style={[styles.typeBadgeText, { color: shiftTypeColor[badgeType] }]}>
                    {shiftTypeLabel[badgeType]}
                  </Text>
                </View>
              ) : null}
            </View>

            {timedSlots.length > 0 ? (
              timedSlots.map(({ draft, index }) => {
                const pause = pauseOf(draft);
                return (
                  <View key={index} style={styles.slotBlock}>
                    {/* Bandeau horaire géant — tappable pour corriger le jour */}
                    <Pressable
                      onPress={() => onEditDay(day.date)}
                      accessibilityRole="button"
                      accessibilityLabel={`Corriger le créneau ${draft.start} ${draft.end}`}
                      style={[styles.timeBand, { backgroundColor: colors.background }]}
                    >
                      <Text style={[styles.timeBandValue, { color: colors.text }]}>
                        {draft.start}
                      </Text>
                      <Text style={[styles.timeBandArrow, { color: colors.textDisabled }]}>→</Text>
                      <Text style={[styles.timeBandValue, { color: colors.text }]}>{draft.end}</Text>
                    </Pressable>
                    <View style={styles.metaRow}>
                      <Text style={[styles.metaLeft, { color: colors.textMuted }]}>
                        {pause > 0
                          ? `Pause : ${formatBreak(pause)}${draft.breakStart ? ` à ${draft.breakStart}` : ""}`
                          : "Sans pause"}
                      </Text>
                      <Text style={[styles.metaRight, { color: colors.accent }]}>
                        {formatHours(paidOf(draft))} payées
                      </Text>
                    </View>
                  </View>
                );
              })
            ) : (
              <View style={[styles.timeBand, { backgroundColor: colors.background }]}>
                <Text style={[styles.timeBandLabel, { color: colors.textMuted }]}>
                  {badgeType ? shiftTypeLabel[badgeType] : "Jour non lu"}
                </Text>
              </View>
            )}

            {/* Deux boutons côte à côte, séparés du contenu par un filet */}
            <View style={[styles.cardActions, { borderTopColor: colors.separator }]}>
              <View style={styles.actionCorrect}>
                <Button label="Corriger" variant="secondary" onPress={() => onEditDay(day.date)} />
              </View>
              <View style={styles.actionApprove}>
                <Button label="C'est bon ✓" onPress={onApprove} />
              </View>
            </View>
          </View>
        ) : null}

        {hasHandwriting ? (
          <View style={[styles.handNote, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.handDot, { backgroundColor: colors.accent }]} />
            <Text style={[styles.handText, { color: colors.textSoft }]}>
              Corrigé au stylo sur le planning — la version manuscrite est retenue.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Coussin bas : le compteur ne colle plus au bord de l'écran */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Text style={[styles.counter, { color: colors.textMuted }]}>
          {validated} validé{validated > 1 ? "s" : ""} · plus que {remaining}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: 14,
  },
  titleBlock: {
    gap: 4,
    marginTop: spacing.sm,
  },
  title: {
    fontSize: typeScale.title,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.title,
  },
  subtitle: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
  },
  pillRow: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 7,
  },
  pill: {
    width: 28,
    height: 28,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pillLabel: {
    fontSize: 11.5,
    fontFamily: fonts.semiBold,
  },
  pillLabelActive: {
    fontFamily: fonts.bold,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg - 4,
    gap: 14,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  cardDate: {
    flex: 1,
    fontSize: 17,
    fontFamily: fonts.bold,
    letterSpacing: -0.3,
  },
  typeBadge: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  typeBadgeText: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
  },
  slotBlock: {
    gap: 14,
  },
  timeBand: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    borderRadius: radius.sm,
    paddingVertical: 18,
  },
  timeBandValue: {
    fontSize: 28,
    fontFamily: fonts.bold,
    letterSpacing: -1,
  },
  timeBandArrow: {
    fontSize: 16,
    fontFamily: fonts.medium,
  },
  timeBandLabel: {
    fontSize: 22,
    fontFamily: fonts.bold,
    letterSpacing: -0.5,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  metaLeft: {
    fontSize: 13,
    fontFamily: fonts.medium,
  },
  metaRight: {
    fontSize: 13,
    fontFamily: fonts.bold,
  },
  cardActions: {
    flexDirection: "row",
    gap: spacing.sm,
    borderTopWidth: 1,
    paddingTop: 12,
  },
  actionCorrect: { flex: 1 },
  actionApprove: { flex: 1.4 },
  handNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  handDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  handText: {
    flex: 1,
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  counter: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
    textAlign: "center",
  },
});
