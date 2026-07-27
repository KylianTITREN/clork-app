import { Ionicons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import type { WizardDay } from "@/components/scan/RecapStep";
import {
  fonts,
  letterSpacing,
  radius,
  shiftTypeLabel,
  spacing,
  typeScale,
  useThemeColors,
} from "@/constants/tokens";
import type { DraftShift } from "@/lib/scan-service";

// Correction card-by-card (maquette 4b, écran 3 « Vérifie tes jours ») :
// dots des 7 jours (✓ validé, encre = en cours, vide = à venir), grande carte
// du jour (horaire géant 32px, pause + payées, encart rature manuscrite),
// boutons « Corriger » / « C'est bon ✓ », compteur « x validé · plus que y ».

const DAY_TITLE_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

type ReviewStepProps = {
  days: WizardDay[];
  drafts: DraftShift[];
  queue: string[]; // dates à corriger, dans l'ordre
  queueIndex: number;
  onEditSlot: (draftIndex: number) => void;
  /** Jour non lu : ouvre l'éditeur pour créer les horaires. */
  onFillDay: (date: string) => void;
  onApprove: () => void;
};

function formatHours(value: number): string {
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}h`;
}

function formatBreak(minutes: number): string {
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h${minutes % 60 ? String(minutes % 60).padStart(2, "0") : ""}`
    : `${minutes} min`;
}

function paidOf(draft: DraftShift): number {
  if (draft.durationHours != null) return draft.durationHours;
  if (!draft.start || !draft.end) return 0;
  const [sh, sm] = draft.start.split(":").map(Number);
  const [eh, em] = draft.end.split(":").map(Number);
  return (eh * 60 + em - sh * 60 - sm) / 60;
}

export function ReviewStep({
  days,
  drafts,
  queue,
  queueIndex,
  onEditSlot,
  onFillDay,
  onApprove,
}: ReviewStepProps) {
  const colors = useThemeColors();
  const currentDate = queue[queueIndex];
  const day = days.find((d) => d.date === currentDate);
  const validated = queueIndex;
  const remaining = queue.length - queueIndex;
  const isTodo = day?.status === "todo" && (day?.draftIndexes.length ?? 0) === 0;
  const mainDraft = day?.draftIndexes.map((i) => drafts[i]).find((d) => d?.start && d.end);
  const hasHandwriting = day?.draftIndexes.some((i) => drafts[i]?.fromHandwriting) ?? false;

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.text }]}>Vérifie tes jours</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Tes jours sélectionnés, un par un — corrige ou confirme.
        </Text>

        {/* Dots des 7 jours */}
        <View style={styles.dots}>
          {days.map((d) => {
            const posInQueue = queue.indexOf(d.date);
            const inQueue = posInQueue !== -1;
            const isDone = inQueue && posInQueue < queueIndex;
            const isCurrent = inQueue && posInQueue === queueIndex;
            return (
              <View
                key={d.date}
                style={[
                  styles.dot,
                  isDone
                    ? { backgroundColor: colors.success }
                    : isCurrent
                      ? { backgroundColor: colors.ink }
                      : inQueue
                        ? { borderWidth: 1.5, borderColor: colors.textDisabled }
                        : { backgroundColor: colors.surfaceMuted },
                ]}
              >
                {isDone ? <Ionicons name="checkmark" size={11} color="#FFF" /> : null}
              </View>
            );
          })}
        </View>

        {day ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.cardDate, { color: colors.text }]}>
                {DAY_TITLE_FORMATTER.format(new Date(`${day.date}T12:00:00`))
                  .replace(/^./, (c) => c.toUpperCase())}
              </Text>
              {mainDraft ? (
                <View style={[styles.typeChip, { backgroundColor: colors.accentMuted }]}>
                  <Text style={[styles.typeChipText, { color: colors.accent }]}>
                    {shiftTypeLabel[mainDraft.type]}
                  </Text>
                </View>
              ) : null}
            </View>

            {isTodo ? (
              <>
                <Text style={[styles.todoTitle, { color: colors.textMuted }]}>
                  Jour non lu sur la photo
                </Text>
                <Button label="Ajouter les horaires" onPress={() => onFillDay(day.date)} />
              </>
            ) : (
              <>
                {day.draftIndexes
                  .map((i) => ({ draft: drafts[i], index: i }))
                  .filter(({ draft }) => draft && draft.start && draft.end)
                  .map(({ draft, index }) => (
                    <View key={index} style={styles.slotBlock}>
                      <Text style={[styles.bigTime, { color: colors.text }]}>
                        {draft.start} → {draft.end}
                      </Text>
                      <Text style={[styles.slotDetail, { color: colors.textSoft }]}>
                        {(() => {
                          const paid = paidOf(draft);
                          const span =
                            draft.start && draft.end
                              ? (Number(draft.end.slice(0, 2)) * 60 +
                                  Number(draft.end.slice(3)) -
                                  Number(draft.start.slice(0, 2)) * 60 -
                                  Number(draft.start.slice(3))) /
                                60
                              : 0;
                          const pause = Math.round((span - paid) * 60);
                          return `${pause > 0 ? `Pause ${formatBreak(pause)}${draft.breakStart ? ` à ${draft.breakStart}` : ""} · ` : ""}${formatHours(paid)} payées`;
                        })()}
                      </Text>
                      <Button
                        label="Corriger"
                        variant="secondary"
                        onPress={() => onEditSlot(index)}
                      />
                    </View>
                  ))}
                {day.draftIndexes.every((i) => !drafts[i]?.start) ? (
                  <>
                    <Text style={[styles.bigTime, { color: colors.text }]}>
                      {drafts[day.draftIndexes[0] ?? -1]
                        ? shiftTypeLabel[drafts[day.draftIndexes[0]].type]
                        : "Repos"}
                    </Text>
                    <Button
                      label="Changer"
                      variant="secondary"
                      onPress={() =>
                        day.draftIndexes.length > 0
                          ? onEditSlot(day.draftIndexes[0])
                          : onFillDay(day.date)
                      }
                    />
                  </>
                ) : null}
              </>
            )}

            {hasHandwriting ? (
              <View style={[styles.handNote, { backgroundColor: colors.accentMuted }]}>
                <View style={[styles.handDot, { backgroundColor: colors.accent }]} />
                <Text style={[styles.handText, { color: colors.accentDeep }]}>
                  Corrigé au stylo sur le planning — la version manuscrite est retenue.
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.actions}>
        <Button label="C'est bon ✓" onPress={onApprove} />
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
  },
  dots: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginVertical: spacing.sm,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md + 2,
    gap: spacing.sm + 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  cardDate: {
    flex: 1,
    fontSize: typeScale.heading,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.heading,
  },
  typeChip: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  typeChipText: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
  },
  slotBlock: {
    gap: 8,
  },
  bigTime: {
    fontSize: 32,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.title,
  },
  slotDetail: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
  },
  todoTitle: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
  },
  handNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    padding: 10,
  },
  handDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  handText: {
    flex: 1,
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
  },
  actions: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: 8,
  },
  counter: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
    textAlign: "center",
  },
});
