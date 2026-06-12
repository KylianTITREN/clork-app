import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ShiftEditorModal, type EditorTarget } from "@/components/week/ShiftEditorModal";
import {
  fonts,
  radius,
  shiftPeriodLabel,
  shiftTypeColor,
  shiftTypeLabel,
  shiftTypeSoftColor,
  softShadow,
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
const CHIP_LETTERS = ["L", "M", "M", "J", "V", "S", "D"];

function formatBreak(minutes: number): string {
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h${minutes % 60 ? String(minutes % 60).padStart(2, "0") : ""}`
    : `${minutes} min`;
}

function toLocalTime(iso: string): string {
  return TIME_FORMATTER.format(new Date(iso));
}

export default function WeekScreen() {
  const colors = useThemeColors();
  const { session } = useAuth();
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [focusedDay, setFocusedDay] = useState<string | null>(null);
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const userId = session?.user.id;
  const sunday = addDays(monday, 6);
  const todayIso = new Date().toISOString().slice(0, 10);

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

  const visibleDays = focusedDay ? days.filter((d) => d.date === focusedDay) : days;

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
        `${count} événement${count > 1 ? "s" : ""} dans le calendrier « Clork ». ` +
          "Il se synchronise avec Google/Apple/Outlook via les comptes du téléphone.",
      );
    } catch (error) {
      Alert.alert("Export échoué", error instanceof Error ? error.message : "Erreur inconnue");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <SafeAreaView edges={["top"]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.kicker, { color: colors.textMuted }]}>Mon planning</Text>
          <Text style={[styles.title, { color: colors.text }]}>Ma semaine</Text>
        </View>
        <Pressable
          onPress={handleExport}
          disabled={isExporting}
          style={[
            styles.exportButton,
            { backgroundColor: colors.surface, opacity: isExporting ? 0.5 : 1 },
            softShadow,
          ]}
        >
          <Ionicons name="share-outline" size={18} color={colors.accent} />
          <Text style={[styles.exportLabel, { color: colors.accent }]}>Exporter</Text>
        </Pressable>
      </View>

      <View style={styles.weekNav}>
        <Pressable
          onPress={() => setMonday(addDays(monday, -7))}
          hitSlop={12}
          style={[styles.navChevron, { backgroundColor: colors.surface }, softShadow]}
        >
          <Ionicons name="chevron-back" size={18} color={colors.accent} />
        </Pressable>
        <Pressable onPress={() => setMonday(mondayOf(new Date()))}>
          <Text style={[styles.weekLabel, { color: colors.text }]}>{weekLabel(monday)}</Text>
        </Pressable>
        <Pressable
          onPress={() => setMonday(addDays(monday, 7))}
          hitSlop={12}
          style={[styles.navChevron, { backgroundColor: colors.surface }, softShadow]}
        >
          <Ionicons name="chevron-forward" size={18} color={colors.accent} />
        </Pressable>
      </View>

      <View style={styles.dayStrip}>
        {days.map(({ date, shifts: dayShifts }, i) => {
          const isToday = date === todayIso;
          const isFocused = focusedDay === date;
          const hasWork = dayShifts.some((s) => s.type === "work" || s.type === "meeting");
          return (
            <Pressable
              key={date}
              onPress={() => setFocusedDay(isFocused ? null : date)}
              style={styles.dayChipWrap}
            >
              <Text style={[styles.dayChipLetter, { color: colors.textMuted }]}>
                {CHIP_LETTERS[i]}
              </Text>
              <View
                style={[
                  styles.dayChip,
                  {
                    backgroundColor: isFocused
                      ? colors.accent
                      : isToday
                        ? colors.accentMuted
                        : colors.surface,
                  },
                  !isFocused && softShadow,
                ]}
              >
                <Text
                  style={[
                    styles.dayChipNumber,
                    { color: isFocused ? "#FFF" : colors.text },
                  ]}
                >
                  {date.slice(8)}
                </Text>
              </View>
              <View
                style={[
                  styles.dayChipDot,
                  { backgroundColor: hasWork ? colors.accent : "transparent" },
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {shifts.length > 0 ? (
          <View style={[styles.heroCard, { backgroundColor: colors.accent }, softShadow]}>
            <View style={styles.heroTextBox}>
              <Text style={styles.heroLabel}>Heures payées cette semaine</Text>
              <Text style={styles.heroValue}>
                {weekHours.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}h
              </Text>
            </View>
            <View style={styles.heroBadge}>
              <Ionicons name="time-outline" size={28} color="#FFF" />
            </View>
          </View>
        ) : (
          <View style={[styles.emptyHint, { backgroundColor: colors.surface }, softShadow]}>
            <Text style={[styles.emptyHintText, { color: colors.textMuted }]}>
              Aucun créneau cette semaine — scanne un planning ou ajoute un jour avec « + ».
            </Text>
          </View>
        )}

        {visibleDays.map(({ date, shifts: dayShifts }) => (
          <View key={date} style={styles.daySection}>
            <View style={styles.dayHeader}>
              <Text
                style={[
                  styles.dayLabel,
                  { color: date === todayIso ? colors.accent : colors.textMuted },
                ]}
              >
                {DAY_FORMATTER.format(new Date(`${date}T12:00:00`))}
                {date === todayIso ? "  ·  aujourd'hui" : ""}
              </Text>
              <Pressable
                onPress={() => userId && setEditorTarget({ mode: "create", date, userId })}
                hitSlop={8}
              >
                <Ionicons name="add-circle" size={24} color={colors.accent} />
              </Pressable>
            </View>

            {dayShifts.length === 0 ? (
              <View style={[styles.restCard, { borderColor: colors.border }]}>
                <Text style={[styles.restLabel, { color: colors.textMuted }]}>
                  Rien de prévu
                </Text>
              </View>
            ) : (
              dayShifts.map((shift) => {
                const period = shiftPeriodLabel(
                  shift.start_at ? toLocalTime(shift.start_at) : null,
                  shift.end_at ? toLocalTime(shift.end_at) : null,
                );
                return (
                  <Pressable
                    key={shift.id}
                    onPress={() => setEditorTarget({ mode: "edit", shift })}
                    style={({ pressed }) => [
                      styles.shiftCard,
                      {
                        backgroundColor: shiftTypeSoftColor[shift.type],
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}
                  >
                    <View style={styles.shiftHeader}>
                      <View style={styles.shiftTitleRow}>
                        <View
                          style={[styles.shiftDot, { backgroundColor: shiftTypeColor[shift.type] }]}
                        />
                        <Text style={[styles.shiftType, { color: "#251F3D" }]}>
                          {shiftTypeLabel[shift.type]}
                          {shift.is_edited ? " ✍️" : ""}
                        </Text>
                        {shift.type === "work" && period ? (
                          <View style={[styles.periodChip, { backgroundColor: "rgba(255,255,255,0.7)" }]}>
                            <Text style={[styles.periodLabel, { color: "#251F3D" }]}>{period}</Text>
                          </View>
                        ) : null}
                      </View>
                      {shift.start_at && shift.end_at ? (
                        <Text style={[styles.shiftTime, { color: "#251F3D" }]}>
                          {toLocalTime(shift.start_at)} – {toLocalTime(shift.end_at)}
                        </Text>
                      ) : null}
                    </View>

                    {shift.break_minutes > 0 ? (
                      <View style={styles.pauseRow}>
                        <View style={[styles.pauseLine, { borderColor: "rgba(37,31,61,0.25)" }]} />
                        <Text style={[styles.pauseText, { color: "rgba(37,31,61,0.6)" }]}>
                          {formatBreak(shift.break_minutes)} de pause
                        </Text>
                        <View style={[styles.pauseLine, { borderColor: "rgba(37,31,61,0.25)" }]} />
                      </View>
                    ) : null}

                    {shift.note ? (
                      <Text
                        style={[styles.shiftNote, { color: "rgba(37,31,61,0.65)" }]}
                        numberOfLines={2}
                      >
                        {shift.note}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })
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
  kicker: {
    fontSize: typeScale.caption,
    fontFamily: fonts.bold,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  title: {
    fontSize: typeScale.title,
    fontFamily: fonts.black,
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
    fontFamily: fonts.extraBold,
  },
  weekNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  navChevron: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  weekLabel: {
    fontSize: typeScale.body,
    fontFamily: fonts.extraBold,
  },
  dayStrip: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  dayChipWrap: {
    alignItems: "center",
    gap: spacing.xs,
  },
  dayChipLetter: {
    fontSize: typeScale.caption,
    fontFamily: fonts.bold,
  },
  dayChip: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  dayChipNumber: {
    fontSize: typeScale.body,
    fontFamily: fonts.extraBold,
  },
  dayChipDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  heroTextBox: {
    gap: spacing.xs,
  },
  heroLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: typeScale.caption,
    fontFamily: fonts.bold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  heroValue: {
    color: "#FFF",
    fontSize: typeScale.hero,
    fontFamily: fonts.black,
  },
  heroBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyHint: {
    borderRadius: radius.md,
    padding: spacing.md,
  },
  emptyHintText: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
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
    fontFamily: fonts.extraBold,
    textTransform: "capitalize",
  },
  restCard: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
  },
  restLabel: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
  },
  shiftCard: {
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  shiftHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  shiftTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexShrink: 1,
  },
  shiftDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  shiftType: {
    fontSize: typeScale.body,
    fontFamily: fonts.extraBold,
  },
  periodChip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  periodLabel: {
    fontSize: 11,
    fontFamily: fonts.bold,
  },
  shiftTime: {
    fontSize: typeScale.body,
    fontFamily: fonts.black,
  },
  pauseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  pauseLine: {
    flex: 1,
    borderBottomWidth: 1.5,
    borderStyle: "dashed",
  },
  pauseText: {
    fontSize: 11,
    fontFamily: fonts.bold,
  },
  shiftNote: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
  },
});
