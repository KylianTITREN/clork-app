import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ShiftEditorModal, type EditorTarget } from "@/components/week/ShiftEditorModal";
import {
  radius,
  shiftTypeColor,
  shiftTypeLabel,
  spacing,
  typeScale,
  useThemeColors,
} from "@/constants/tokens";
import { ensurePermission, exportWeek } from "@/lib/calendar-export";
import { addDays, mondayOf, weekLabel } from "@/lib/dates";
import { supabase } from "@/lib/supabase";
import type { Shift } from "@/lib/types";
import { useAuth } from "@/providers/auth-provider";

const DAY_FORMATTER = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric" });
const TIME_FORMATTER = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

function formatBreak(minutes: number): string {
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h${minutes % 60 ? String(minutes % 60).padStart(2, "0") : ""}`
    : `${minutes} min`;
}

export default function WeekScreen() {
  const colors = useThemeColors();
  const { session } = useAuth();
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const userId = session?.user.id;
  const sunday = addDays(monday, 6);
  const todayIso = mondayOf(new Date()) === monday ? new Date().toISOString().slice(0, 10) : null;

  const loadShifts = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("shifts")
      .select("*")
      .eq("user_id", userId)
      .gte("date", monday)
      .lte("date", sunday)
      .order("date")
      .order("start_at");
    setShifts((data as Shift[]) ?? []);
  }, [userId, monday, sunday]);

  useFocusEffect(
    useCallback(() => {
      loadShifts();
    }, [loadShifts]),
  );

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const date = addDays(monday, i);
        return { date, shifts: shifts.filter((s) => s.date === date) };
      }),
    [monday, shifts],
  );

  // Heures payées de la semaine affichée.
  const weekHours = useMemo(
    () =>
      shifts
        .filter((s) => s.type === "work" && s.start_at && s.end_at)
        .reduce(
          (acc, s) =>
            acc +
            (new Date(s.end_at as string).getTime() -
              new Date(s.start_at as string).getTime()) /
              3_600_000 -
            s.break_minutes / 60,
          0,
        ),
    [shifts],
  );

  async function handleExport() {
    if (shifts.length === 0) {
      Alert.alert("Rien à exporter", "Cette semaine ne contient aucun créneau.");
      return;
    }
    setIsExporting(true);
    try {
      const granted = await ensurePermission();
      if (!granted) {
        Alert.alert(
          "Accès calendrier refusé",
          "Autorise l'accès au calendrier dans Réglages pour exporter tes horaires.",
        );
        return;
      }
      const count = await exportWeek(monday, shifts);
      Alert.alert(
        "Exporté ✅",
        `${count} événement${count > 1 ? "s" : ""} dans le calendrier « Clork » de ton téléphone. ` +
          "Il se synchronise automatiquement avec Google/Apple/Outlook selon tes comptes.",
      );
    } catch (error) {
      Alert.alert(
        "Export échoué",
        error instanceof Error ? error.message : "Erreur inconnue",
      );
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Ma semaine</Text>
        <Pressable
          onPress={handleExport}
          disabled={isExporting}
          style={[styles.exportButton, { backgroundColor: colors.surfaceMuted, opacity: isExporting ? 0.5 : 1 }]}
        >
          <Ionicons name="share-outline" size={18} color={colors.accent} />
          <Text style={[styles.exportLabel, { color: colors.accent }]}>Exporter</Text>
        </Pressable>
      </View>

      <View style={styles.weekNav}>
        <Pressable onPress={() => setMonday(addDays(monday, -7))} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
        </Pressable>
        <Pressable onPress={() => setMonday(mondayOf(new Date()))}>
          <Text style={[styles.weekLabel, { color: colors.text }]}>{weekLabel(monday)}</Text>
        </Pressable>
        <Pressable onPress={() => setMonday(addDays(monday, 7))} hitSlop={12}>
          <Ionicons name="chevron-forward" size={22} color={colors.accent} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {shifts.length > 0 ? (
          <View style={[styles.heroCard, { backgroundColor: colors.accent }]}>
            <Text style={styles.heroLabel}>Heures payées cette semaine</Text>
            <Text style={styles.heroValue}>
              {weekHours.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}h
            </Text>
          </View>
        ) : (
          <View style={[styles.emptyHint, { backgroundColor: colors.surfaceMuted }]}>
            <Text style={[styles.emptyHintText, { color: colors.textMuted }]}>
              Aucun créneau cette semaine — scanne un planning ou ajoute un jour avec « + ».
            </Text>
          </View>
        )}

        {days.map(({ date, shifts: dayShifts }) => (
          <View key={date} style={styles.daySection}>
            <View style={styles.dayHeader}>
              <Text
                style={[
                  styles.dayLabel,
                  { color: date === todayIso ? colors.accent : colors.textMuted },
                ]}
              >
                {DAY_FORMATTER.format(new Date(`${date}T12:00:00`))}
                {date === todayIso ? "  · aujourd'hui" : ""}
              </Text>
              <Pressable
                onPress={() => userId && setEditorTarget({ mode: "create", date, userId })}
                hitSlop={8}
              >
                <Ionicons name="add-circle-outline" size={22} color={colors.accent} />
              </Pressable>
            </View>

            {dayShifts.length === 0 ? (
              <View style={[styles.restCard, { borderColor: colors.border }]}>
                <Text style={[styles.restLabel, { color: colors.textMuted }]}>—</Text>
              </View>
            ) : (
              dayShifts.map((shift) => (
                <Pressable
                  key={shift.id}
                  onPress={() => setEditorTarget({ mode: "edit", shift })}
                  style={({ pressed }) => [
                    styles.shiftCard,
                    {
                      backgroundColor: colors.surface,
                      borderLeftColor: shiftTypeColor[shift.type],
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <View style={styles.shiftMain}>
                    <Text style={[styles.shiftType, { color: colors.text }]}>
                      {shiftTypeLabel[shift.type]}
                      {shift.is_edited ? " ✍️" : ""}
                    </Text>
                    {shift.note ? (
                      <Text style={[styles.shiftNote, { color: colors.textMuted }]} numberOfLines={1}>
                        {shift.note}
                      </Text>
                    ) : null}
                  </View>
                  {shift.start_at && shift.end_at ? (
                    <View style={styles.shiftTimeBox}>
                      <Text style={[styles.shiftTime, { color: colors.text }]}>
                        {TIME_FORMATTER.format(new Date(shift.start_at))} –{" "}
                        {TIME_FORMATTER.format(new Date(shift.end_at))}
                      </Text>
                      {shift.break_minutes > 0 ? (
                        <Text style={[styles.shiftBreak, { color: colors.textMuted }]}>
                          {formatBreak(shift.break_minutes)} pause
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </Pressable>
              ))
            )}
          </View>
        ))}
      </ScrollView>

      <ShiftEditorModal
        target={editorTarget}
        onClose={(didChange) => {
          setEditorTarget(null);
          if (didChange) loadShifts();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  title: {
    fontSize: typeScale.title,
    fontWeight: "800",
  },
  exportButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  exportLabel: {
    fontSize: typeScale.caption,
    fontWeight: "700",
  },
  weekNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  weekLabel: {
    fontSize: typeScale.body,
    fontWeight: "700",
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  heroCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  heroLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: typeScale.caption,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  heroValue: {
    color: "#FFF",
    fontSize: typeScale.hero,
    fontWeight: "800",
  },
  emptyHint: {
    borderRadius: radius.md,
    padding: spacing.md,
  },
  emptyHintText: {
    fontSize: typeScale.caption,
    lineHeight: 18,
  },
  daySection: {
    gap: spacing.xs,
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dayLabel: {
    fontSize: typeScale.caption,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  restCard: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  restLabel: {
    fontSize: typeScale.caption,
  },
  shiftCard: {
    flexDirection: "row",
    alignItems: "center",
    borderLeftWidth: 4,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  shiftMain: {
    flex: 1,
    gap: 2,
  },
  shiftType: {
    fontSize: typeScale.body,
    fontWeight: "700",
  },
  shiftNote: {
    fontSize: typeScale.caption,
  },
  shiftTimeBox: {
    alignItems: "flex-end",
    gap: 2,
  },
  shiftTime: {
    fontSize: typeScale.body,
    fontWeight: "800",
  },
  shiftBreak: {
    fontSize: typeScale.caption,
  },
});
