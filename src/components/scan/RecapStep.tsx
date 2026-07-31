import { Ionicons } from "@expo/vector-icons";
import { ScrollView, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
// non lu est coché d'office), pied contextuel — UN SEUL bouton pleine largeur :
//   0 coché  → « Tout valider » en 1 tap
//   m cochés → « Corriger (m) » seul (retour Kylian : tant qu'un jour est à
//              revoir, on ne propose pas de valider à côté).

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
  /**
   * Total hebdo imprimé sur le planning, fourni UNIQUEMENT quand il ne colle
   * pas à ce qui a été lu : l'écart reste alors visible jusqu'à la validation.
   */
  printedHours?: number | null;
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
  printedHours = null,
  onToggle,
  onCorrect,
  onValidate,
  isSaving,
}: RecapStepProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const unreadCount = days.filter((d) => d.status === "todo").length;
  const checkedCount = checked.size;

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
            {printedHours != null ? (
              // L'écart avec le total imprimé trahit une ligne décalée : il
              // reste affiché jusqu'au bout, sans bloquer la validation.
              <Text style={[styles.totalNote, { color: colors.shiftCp }]}>
                {"  "}· planning : {formatHours(printedHours)}
              </Text>
            ) : null}
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
          // Un créneau retiré à la correction (include:false) ne s'affiche plus.
          const included = day.draftIndexes.map((i) => drafts[i]).filter((d) => !!d && d.include);
          const slots = included.filter(
            (d): d is DraftShift => d.start != null && d.end != null,
          );
          const isOff = day.status === "off" && slots.length === 0;
          const isRh = included[0]?.type === "rh";
          return (
            <Pressable
              key={day.date}
              onPress={() => onToggle(day.date)}
              style={[
                styles.dayCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
                isTodo && { borderColor: colors.shiftCp, borderStyle: "dashed", borderWidth: 1.5 },
                isChecked && !isTodo && { borderColor: colors.accent },
                isOff && !isRh && styles.dayCardOff,
              ]}
            >
              {/* Colonne date : « LUN » au-dessus du quantième, sans fond */}
              <View style={styles.dateColumn}>
                <Text style={[styles.dateDay, { color: colors.textMuted }]}>
                  {DAY_LABELS[day.index]}
                </Text>
                <Text
                  style={[styles.dateNumber, { color: isOff ? colors.textSoft : colors.text }]}
                >
                  {Number(day.date.slice(8))}
                </Text>
              </View>
              <View style={styles.dayBody}>
                {isTodo ? (
                  <View style={styles.slotRow}>
                    <View style={[styles.todoBadge, { backgroundColor: colors.shiftCpSoft }]}>
                      <Text style={[styles.todoBadgeMark, { color: colors.shiftCp }]}>?</Text>
                    </View>
                    <Text style={[styles.todoLabel, { color: colors.shiftCp }]}>À compléter</Text>
                  </View>
                ) : slots.length === 0 ? (
                  <View style={styles.slotRow}>
                    <View
                      style={[
                        styles.slotBar,
                        { backgroundColor: isRh ? colors.shiftRh : "#C9C5B8" },
                      ]}
                    />
                    <Text
                      style={
                        isRh
                          ? [styles.rhLabel, { color: colors.text }]
                          : [styles.offLabel, { color: colors.textMuted }]
                      }
                    >
                      {isRh ? "RH" : "Repos"}
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
            : `${checkedCount} jour${checkedCount > 1 ? "s" : ""} à revoir${unreadCount > 0 ? " · le jour non lu est coché d'office" : ""}`}
        </Text>
      </ScrollView>

      {/* Coussin bas : les CTA ne collent plus au bord de l'écran */}
      <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.lg }]}>
        {checkedCount === 0 ? (
          <Button label="Tout valider" onPress={onValidate} isLoading={isSaving} />
        ) : (
          <Button label={`Corriger (${checkedCount})`} variant="dark" onPress={onCorrect} />
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
    opacity: 0.6,
  },
  dateColumn: {
    width: 40,
    alignItems: "center",
  },
  dateDay: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
  },
  dateNumber: {
    fontSize: 14,
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
    height: 22,
    borderRadius: 2,
  },
  todoBadge: {
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  todoBadgeMark: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.bold,
  },
  rhLabel: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
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
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  footNote: {
    fontSize: 11.5,
    fontFamily: fonts.medium,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  actions: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
});
