import { Ionicons } from "@expo/vector-icons";
import { ScrollView, Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import {
  fonts,
  letterSpacing,
  radius,
  shiftTypeColor,
  spacing,
  typeScale,
  useThemeColors,
} from "@/constants/tokens";
import type { DraftShift } from "@/lib/scan-service";

// Étape 2 du wizard — récap « Tout est bon ? » (maquette 4b, écran 2) :
// barre sombre TOTAL LU, 7 lignes jour COCHABLES (cocher = à revoir ; le jour
// non lu est coché d'office), pied contextuel :
//   0 coché  → « Tout valider » en 1 tap
//   m cochés → « Corriger (m) » + « Valider (n) » (n = jours sûrs, les cochés
//              ne sont pas importés — on peut les corriger plus tard).

export type WizardDay = {
  date: string; // YYYY-MM-DD
  index: number; // 0 = lundi
  status: "work" | "off" | "todo";
  draftIndexes: number[];
};

const DAY_LABELS = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"] as const;

type RecapStepProps = {
  days: WizardDay[];
  drafts: DraftShift[];
  checked: ReadonlySet<string>;
  readHours: number;
  onToggle: (date: string) => void;
  onCorrect: () => void;
  onValidate: () => void;
  isSaving: boolean;
};

function formatHours(value: number): string {
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}h`;
}

export function RecapStep({
  days,
  drafts,
  checked,
  readHours,
  onToggle,
  onCorrect,
  onValidate,
  isSaving,
}: RecapStepProps) {
  const colors = useThemeColors();
  const unreadCount = days.filter((d) => d.status === "todo").length;
  const checkedCount = checked.size;
  const validCount = days.filter(
    (d) => !checked.has(d.date) && d.draftIndexes.some((i) => drafts[i]?.include),
  ).length;

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.text }]}>Tout est bon ?</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Coche les jours à revoir, ou valide tout d'un geste.
        </Text>

        <View style={[styles.totalBar, { backgroundColor: colors.ink }]}>
          <Text style={[styles.totalLabel, { color: colors.onInk, opacity: 0.7 }]}>TOTAL LU</Text>
          <Text style={[styles.totalValue, { color: colors.onInk }]}>
            {formatHours(readHours)}
            {unreadCount > 0 ? (
              <Text style={[styles.totalNote, { opacity: 0.7 }]}>
                {"  "}· {unreadCount} jour{unreadCount > 1 ? "s" : ""} non lu{unreadCount > 1 ? "s" : ""}
              </Text>
            ) : null}
          </Text>
        </View>

        {days.map((day) => {
          const isChecked = checked.has(day.date);
          const isTodo = day.status === "todo";
          const slots = day.draftIndexes
            .map((i) => drafts[i])
            .filter((d): d is DraftShift => !!d && d.start != null && d.end != null);
          const isOff = day.status === "off" && slots.length === 0;
          return (
            <Pressable
              key={day.date}
              onPress={() => onToggle(day.date)}
              style={[
                styles.dayCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
                isTodo && { borderColor: colors.shiftCp, borderStyle: "dashed", backgroundColor: "transparent" },
                isChecked && !isTodo && { borderColor: colors.accent },
                isOff && styles.dayCardOff,
              ]}
            >
              <View style={[styles.dateSquare, { backgroundColor: colors.background }]}>
                <Text style={[styles.dateDay, { color: colors.textMuted }]}>
                  {DAY_LABELS[day.index]}
                </Text>
                <Text style={[styles.dateNumber, { color: colors.text }]}>
                  {day.date.slice(8)}
                </Text>
              </View>
              <View style={styles.dayBody}>
                {isTodo ? (
                  <View style={styles.slotRow}>
                    <Ionicons name="help-circle-outline" size={15} color={colors.shiftCp} />
                    <Text style={[styles.todoLabel, { color: colors.shiftCp }]}>À compléter</Text>
                  </View>
                ) : slots.length === 0 ? (
                  <View style={styles.slotRow}>
                    <View style={[styles.slotBar, { backgroundColor: "#C9C5B8" }]} />
                    <Text style={[styles.offLabel, { color: colors.textMuted }]}>
                      {drafts[day.draftIndexes[0] ?? -1]?.type === "rh" ? "RH" : "Repos"}
                    </Text>
                  </View>
                ) : (
                  slots.map((slot, i) => (
                    <View key={i} style={styles.slotRow}>
                      <View style={[styles.slotBar, { backgroundColor: shiftTypeColor[slot.type] }]} />
                      <Text style={[styles.slotTime, { color: colors.text }]}>
                        {slot.start} – {slot.end}
                      </Text>
                      {slot.durationHours != null ? (
                        <Text style={[styles.slotMeta, { color: colors.textMuted }]}>
                          {formatHours(slot.durationHours)}
                        </Text>
                      ) : null}
                    </View>
                  ))
                )}
              </View>
              <View
                style={[
                  styles.checkbox,
                  isChecked
                    ? { backgroundColor: isTodo ? colors.ink : colors.accent, borderColor: "transparent" }
                    : { borderColor: colors.border, backgroundColor: colors.surface },
                ]}
              >
                {isChecked ? <Ionicons name="checkmark" size={15} color="#FFFFFF" /> : null}
              </View>
            </Pressable>
          );
        })}

        <Text style={[styles.footNote, { color: colors.textMuted }]}>
          {checkedCount === 0
            ? "Tout est bon ? Valide d'un geste."
            : `${checkedCount} sélectionné${checkedCount > 1 ? "s" : ""}${unreadCount > 0 ? " · le jour non lu est coché d'office" : ""}`}
        </Text>
      </ScrollView>

      <View style={styles.actions}>
        {checkedCount === 0 ? (
          <Button label="Tout valider" onPress={onValidate} isLoading={isSaving} />
        ) : (
          <View style={styles.actionRow}>
            <View style={styles.flex}>
              <Button label={`Corriger (${checkedCount})`} variant="dark" onPress={onCorrect} />
            </View>
            <View style={styles.flex}>
              <Button
                label={`Valider (${validCount})`}
                onPress={onValidate}
                isLoading={isSaving}
                disabled={validCount === 0}
              />
            </View>
          </View>
        )}
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
  totalBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: spacing.xs,
  },
  totalLabel: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
    letterSpacing: 0.8,
  },
  totalValue: {
    fontSize: typeScale.body + 1,
    fontFamily: fonts.bold,
  },
  totalNote: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.medium,
  },
  dayCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  dayCardOff: {
    opacity: 0.65,
  },
  dateSquare: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  dateDay: {
    fontSize: 10,
    fontFamily: fonts.semiBold,
  },
  dateNumber: {
    fontSize: 16,
    fontFamily: fonts.bold,
  },
  dayBody: {
    flex: 1,
    gap: 4,
  },
  slotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  slotBar: {
    width: 3,
    height: 14,
    borderRadius: 2,
  },
  slotTime: {
    flex: 1,
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
  },
  slotMeta: {
    fontSize: 11.5,
    fontFamily: fonts.medium,
  },
  todoLabel: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
  },
  offLabel: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  footNote: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.medium,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  actions: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
});
