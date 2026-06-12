import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { DraftShiftCard } from "@/components/scan/DraftShiftCard";
import { Button } from "@/components/ui/Button";
import { radius, spacing, typeScale, useThemeColors } from "@/constants/tokens";
import type { ExtractionEmployee, PlanningExtraction } from "@/lib/extraction-types";
import {
  applyDefaultBreak,
  isRowCoherent,
  meetingDraftsFromNotes,
  paidHours,
  toDraftShifts,
  type BreakPrefs,
  type DraftShift,
} from "@/lib/scan-service";

const WEEK_FORMATTER = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

type ValidationViewProps = {
  extraction: PlanningExtraction;
  initialTarget: ExtractionEmployee | null;
  breakPrefs: BreakPrefs;
  isSaving: boolean;
  onSave: (drafts: DraftShift[], target: ExtractionEmployee) => void;
  onRetake: () => void;
};

export function ValidationView({
  extraction,
  initialTarget,
  breakPrefs,
  isSaving,
  onSave,
  onRetake,
}: ValidationViewProps) {
  const colors = useThemeColors();
  const [target, setTarget] = useState<ExtractionEmployee | null>(initialTarget);
  const buildDrafts = (employee: ExtractionEmployee) =>
    applyDefaultBreak(
      [...toDraftShifts(employee), ...meetingDraftsFromNotes(extraction)],
      breakPrefs,
    );
  const [drafts, setDrafts] = useState<DraftShift[]>(() =>
    initialTarget ? buildDrafts(initialTarget) : [],
  );

  // Heures PAYÉES (durée imprimée, pause déduite) — comparables au total du planning.
  const totalHours = useMemo(
    () =>
      drafts
        .filter((d) => d.include && d.type === "work")
        .reduce((acc, d) => acc + paidHours(d), 0),
    [drafts],
  );

  function selectTarget(employee: ExtractionEmployee) {
    setTarget(employee);
    setDrafts(buildDrafts(employee));
  }

  function updateDraft(index: number, next: DraftShift) {
    setDrafts((current) => current.map((d, i) => (i === index ? next : d)));
  }

  // --- Pas de ligne ciblée : choisir parmi les lignes extraites ---------------
  if (!target) {
    return (
      <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
        <Text style={[styles.title, { color: colors.text }]}>Qui es-tu sur ce planning ?</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Je n'ai pas reconnu ton nom automatiquement. Choisis ta ligne (et pense à
          renseigner « Nom sur le planning » dans ton profil pour la prochaine fois).
        </Text>
        {extraction.employees.map((employee) => (
          <Pressable
            key={employee.row_index}
            onPress={() => selectTarget(employee)}
            style={[styles.employeeRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Text style={[styles.employeeName, { color: colors.text }]}>{employee.name}</Text>
            <Text style={[styles.employeeMeta, { color: colors.textMuted }]}>
              {employee.total_hours != null ? `${employee.total_hours}h` : "—"}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ))}
        <Button label="Reprendre la photo" variant="ghost" onPress={onRetake} />
      </ScrollView>
    );
  }

  const coherent = isRowCoherent(target);

  return (
    <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>{target.name}</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {extraction.week_start
            ? `Semaine du ${WEEK_FORMATTER.format(new Date(`${extraction.week_start}T12:00:00`))}`
            : "Semaine à confirmer"}
          {extraction.store_label ? ` · ${extraction.store_label}` : ""}
        </Text>
        <Pressable onPress={() => setTarget(null)}>
          <Text style={[styles.switchLine, { color: colors.accentDeep }]}>
            Ce n'est pas la bonne ligne ?
          </Text>
        </Pressable>
      </View>

      {extraction.photo_quality === "degraded" || !coherent ? (
        <View style={[styles.warningBox, { backgroundColor: colors.surfaceMuted, borderColor: colors.shiftCp }]}>
          <Ionicons name="alert-circle" size={18} color={colors.shiftCp} />
          <Text style={[styles.warningText, { color: colors.text }]}>
            {!coherent
              ? "La somme des heures ne colle pas avec le total imprimé : vérifie chaque jour avant d'enregistrer."
              : "Photo partiellement lisible : vérifie bien les horaires avant d'enregistrer."}
          </Text>
        </View>
      ) : null}

      {drafts.map((draft, index) => (
        <DraftShiftCard
          key={`${draft.date}-${draft.type}-${index}`}
          draft={draft}
          onChange={(next) => updateDraft(index, next)}
        />
      ))}

      <View style={[styles.totalRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.totalLabel, { color: colors.textMuted }]}>Total travaillé</Text>
        <Text style={[styles.totalValue, { color: colors.text }]}>
          {totalHours.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}h
          {target.total_hours != null ? ` / ${target.total_hours}h sur le planning` : ""}
        </Text>
      </View>

      <Button
        label="Ajouter à mon calendrier"
        onPress={() => onSave(drafts, target)}
        isLoading={isSaving}
      />
      <Button label="Reprendre la photo" variant="ghost" onPress={onRetake} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  header: {
    gap: spacing.xs,
  },
  title: {
    fontSize: typeScale.title,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: typeScale.body,
  },
  switchLine: {
    fontSize: typeScale.caption,
    fontWeight: "600",
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  warningText: {
    flex: 1,
    fontSize: typeScale.caption,
    lineHeight: 18,
  },
  employeeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  employeeName: {
    flex: 1,
    fontSize: typeScale.body,
    fontWeight: "600",
  },
  employeeMeta: {
    fontSize: typeScale.caption,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  totalLabel: {
    fontSize: typeScale.caption,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  totalValue: {
    fontSize: typeScale.body,
    fontWeight: "800",
  },
});
