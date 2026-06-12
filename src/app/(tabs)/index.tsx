import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Easing, Modal, PanResponder, Pressable, ScrollView, Share as RNShare, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ShiftEditorModal, type EditorTarget } from "@/components/week/ShiftEditorModal";
import {
  fonts,
  radius,
  shiftPeriodLabel,
  shiftPeriodLabels,
  shiftTypeColor,
  shiftTypeLabel,
  shiftTypeSoftColor,
  softShadow,
  spacing,
  typeScale,
  useThemeColors,
} from "@/constants/tokens";
import { ensurePermission, exportWeek } from "@/lib/calendar-export";
import { listFollowed, type FollowedUser } from "@/lib/follow-service";
import { createShare } from "@/lib/share-service";
import { addDays, addMinutesToTime, mondayOf, toShortTime, weekLabel } from "@/lib/dates";
import { supabase } from "@/lib/supabase";
import { refreshWidgetData } from "@/lib/widget-data";
import type { ExtractionEmployee, PlanningExtraction } from "@/lib/extraction-types";
import type { Shift } from "@/lib/types";
import { useAuth } from "@/providers/auth-provider";

const DAY_FORMATTER = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric" });
const TIME_FORMATTER = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const CHIP_LETTERS = ["L", "M", "M", "J", "V", "S", "D"];
// Encre des cartes pastel (fonds clairs dans tous les thèmes).
const INK = "#26210E";

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
  const [colleagues, setColleagues] = useState<ExtractionEmployee[] | null>(null);
  const [expandedColleague, setExpandedColleague] = useState<number | null>(null);
  const [colleaguesScanId, setColleaguesScanId] = useState<string | null>(null);
  // Plannings suivis en lecture seule (ex: celui de sa compagne 💛).
  const [followedList, setFollowedList] = useState<FollowedUser[]>([]);
  const [viewing, setViewing] = useState<FollowedUser | null>(null);
  // Glissement « cranté » d'une semaine à l'autre.
  const slideAnim = useRef(new Animated.Value(0)).current;
  const changeWeekRef = useRef<(deltaDays: number) => void>(() => {});

  function changeWeek(deltaDays: number) {
    setMonday((current) => addDays(current, deltaDays));
    slideAnim.setValue(deltaDays > 0 ? 90 : -90);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }
  changeWeekRef.current = changeWeek;

  // Swipe horizontal sur le bandeau de jours = changer de semaine.
  const swipeResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderRelease: (_, g) => {
        if (g.dx <= -48) changeWeekRef.current(7);
        else if (g.dx >= 48) changeWeekRef.current(-7);
      },
    }),
  ).current;

  async function openColleagues() {
    const { data } = await supabase
      .from("scans")
      .select("id, raw_extraction")
      .eq("week_start", monday)
      .eq("status", "validated")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; raw_extraction: PlanningExtraction | null }>();
    setColleaguesScanId(data?.id ?? null);
    const employees = data?.raw_extraction?.employees;
    if (!employees || employees.length === 0) {
      Alert.alert(
        "Pas de planning d'équipe",
        "Aucun scan validé pour cette semaine — scanne le planning pour voir les horaires des collègues.",
      );
      return;
    }
    setColleagues(employees);
  }

  const userId = session?.user.id;
  const sunday = addDays(monday, 6);
  const todayIso = new Date().toISOString().slice(0, 10);

  const loadShifts = useCallback(async () => {
    const targetId = viewing?.id ?? userId;
    if (!targetId) return;
    const { data } = await supabase
      .from("shifts")
      .select("*")
      .eq("user_id", targetId)
      .gte("date", monday)
      .lte("date", sunday)
      .order("date")
      .order("start_at");
    setShifts((data as Shift[]) ?? []);
    // Widgets : uniquement MON planning.
    if (!viewing)
      void refreshWidgetData((data as Shift[]) ?? [], {
        accent: colors.accent,
        onAccent: colors.onAccent,
      });
  }, [userId, monday, sunday, viewing]);

  useFocusEffect(
    useCallback(() => {
      loadShifts();
      listFollowed().then(setFollowedList);
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
        <View style={styles.headerActions}>
          <Pressable
            onPress={openColleagues}
            style={[styles.iconPill, { backgroundColor: colors.surface }, softShadow]}
            hitSlop={6}
          >
            <Ionicons name="people-outline" size={18} color={colors.accent} />
          </Pressable>
          <Pressable
            onPress={() => router.navigate("/(tabs)/scan")}
            style={[styles.iconPill, { backgroundColor: colors.surface }, softShadow]}
            hitSlop={6}
          >
            <Ionicons name="camera-outline" size={18} color={colors.accent} />
          </Pressable>
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
            <Text style={[styles.exportLabel, { color: colors.text }]}>Exporter</Text>
          </Pressable>
        </View>
      </View>

      {followedList.length > 0 ? (
        <View style={styles.personRow}>
          {[null, ...followedList].map((person) => {
            const selected = (person?.id ?? null) === (viewing?.id ?? null);
            return (
              <Pressable
                key={person?.id ?? "me"}
                onPress={() => setViewing(person)}
                style={[
                  styles.personChip,
                  { backgroundColor: selected ? colors.accent : colors.surface },
                  !selected && softShadow,
                ]}
              >
                <Text
                  style={[
                    styles.personLabel,
                    { color: selected ? colors.onAccent : colors.textMuted },
                  ]}
                >
                  {person ? `💛 ${person.displayName}` : "Moi"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={styles.weekNav}>
        <Pressable
          onPress={() => changeWeek(-7)}
          hitSlop={12}
          style={[styles.navChevron, { backgroundColor: colors.surface }, softShadow]}
        >
          <Ionicons name="chevron-back" size={18} color={colors.accent} />
        </Pressable>
        <Pressable onPress={() => setMonday(mondayOf(new Date()))}>
          <Text style={[styles.weekLabel, { color: colors.text }]}>{weekLabel(monday)}</Text>
        </Pressable>
        <Pressable
          onPress={() => changeWeek(7)}
          hitSlop={12}
          style={[styles.navChevron, { backgroundColor: colors.surface }, softShadow]}
        >
          <Ionicons name="chevron-forward" size={18} color={colors.accent} />
        </Pressable>
      </View>

      <Animated.View style={{ transform: [{ translateX: slideAnim }] }}>
      <View style={styles.dayStrip} {...swipeResponder.panHandlers}>
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
                    { color: isFocused ? colors.onAccent : colors.text },
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

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
      >
        {shifts.length > 0 ? (
          <View style={[styles.heroCard, { backgroundColor: colors.accent }, softShadow]}>
            <View style={styles.heroTextBox}>
              <Text style={[styles.heroLabel, { color: colors.onAccent, opacity: 0.75 }]}>Heures payées cette semaine</Text>
              <Text style={[styles.heroValue, { color: colors.onAccent }]}>
                {weekHours.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}h
              </Text>
            </View>
            <View style={styles.heroBadge}>
              <Ionicons name="time-outline" size={28} color={colors.onAccent} />
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
                  { color: date === todayIso ? colors.text : colors.textMuted },
                ]}
              >
                {DAY_FORMATTER.format(new Date(`${date}T12:00:00`))}
                {date === todayIso ? "  ·  aujourd'hui" : ""}
              </Text>
              {!viewing ? (
                <Pressable
                  onPress={() => userId && setEditorTarget({ mode: "create", date, userId })}
                  hitSlop={8}
                >
                  <Ionicons name="add-circle" size={24} color={colors.accent} />
                </Pressable>
              ) : null}
            </View>

            {dayShifts.length === 0 ? (
              <View style={[styles.restCard, { borderColor: colors.border }]}>
                <Text style={[styles.restLabel, { color: colors.textMuted }]}>
                  Rien de prévu
                </Text>
              </View>
            ) : (
              dayShifts.map((shift) => {
                const period = shift.period
                  ? shiftPeriodLabels[shift.period]
                  : shiftPeriodLabel(
                      shift.start_at ? toLocalTime(shift.start_at) : null,
                      shift.end_at ? toLocalTime(shift.end_at) : null,
                    );
                return (
                  <Pressable
                    key={shift.id}
                    disabled={!!viewing}
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
                        <Text style={[styles.shiftType, { color: INK }]}>
                          {shiftTypeLabel[shift.type]}
                        </Text>
                        {(shift.type === "work" || shift.type === "training") && period ? (
                          <View style={[styles.periodChip, { backgroundColor: "rgba(255,255,255,0.7)" }]}>
                            <Text style={[styles.periodLabel, { color: INK }]}>{period}</Text>
                          </View>
                        ) : null}
                      </View>
                      {shift.start_at && shift.end_at ? (
                        <Text style={[styles.shiftTime, { color: INK }]}>
                          {toLocalTime(shift.start_at)} – {toLocalTime(shift.end_at)}
                        </Text>
                      ) : null}
                    </View>

                    {shift.break_minutes > 0 ? (
                      <View style={styles.pauseRow}>
                        <View style={[styles.pauseLine, { borderColor: "rgba(38,33,14,0.25)" }]} />
                        <Text style={[styles.pauseText, { color: "rgba(38,33,14,0.6)" }]}>
                          {formatBreak(shift.break_minutes)} de pause
                          {shift.break_start
                            ? ` · ${toShortTime(shift.break_start)} → ${addMinutesToTime(shift.break_start, shift.break_minutes)}`
                            : ""}
                        </Text>
                        <View style={[styles.pauseLine, { borderColor: "rgba(38,33,14,0.25)" }]} />
                      </View>
                    ) : null}

                    {shift.note ? (
                      <Text
                        style={[styles.shiftNote, { color: "rgba(38,33,14,0.65)" }]}
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

      </Animated.View>

      {colleagues ? (
        <Modal visible transparent animationType="slide" onRequestClose={() => setColleagues(null)}>
          <Pressable style={styles.colleaguesBackdrop} onPress={() => setColleagues(null)} />
          <View style={[styles.colleaguesSheet, { backgroundColor: colors.background }]}>
            <Text style={[styles.colleaguesTitle, { color: colors.text }]}>
              L'équipe · {weekLabel(monday)}
            </Text>
            <ScrollView contentContainerStyle={styles.colleaguesList}>
              {colleagues.map((employee) => {
                const isExpanded = expandedColleague === employee.row_index;
                return (
                  <Pressable
                    key={employee.row_index}
                    onPress={() =>
                      setExpandedColleague(isExpanded ? null : employee.row_index)
                    }
                    style={[styles.colleagueRow, { backgroundColor: colors.surface }, softShadow]}
                  >
                    <View style={styles.colleagueHeader}>
                      <View style={styles.colleagueText}>
                        <Text style={[styles.colleagueName, { color: colors.text }]} numberOfLines={1}>
                          {employee.name}
                        </Text>
                        <Text style={[styles.colleagueMeta, { color: colors.textMuted }]}>
                          {employee.total_hours != null ? `${employee.total_hours}h cette semaine` : "—"}
                        </Text>
                      </View>
                      <Ionicons
                        name={isExpanded ? "chevron-up" : "chevron-down"}
                        size={18}
                        color={colors.textMuted}
                      />
                    </View>
                    {isExpanded
                      ? employee.days.map((day) => {
                          const summary =
                            day.status === "work" && day.shifts.length > 0
                              ? day.shifts.map((sl) => `${sl.start}–${sl.end}`).join(" / ")
                              : day.status === "rh"
                                ? "RH"
                                : day.status === "cp"
                                  ? "CP"
                                  : "Repos";
                          return (
                            <View key={day.day_index} style={styles.colleagueDayRow}>
                              <Text style={[styles.colleagueDayLabel, { color: colors.textMuted }]}>
                                {day.date
                                  ? new Date(`${day.date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" })
                                  : `Jour ${day.day_index + 1}`}
                              </Text>
                              <Text style={[styles.colleagueDay, { color: colors.text }]}>{summary}</Text>
                            </View>
                          );
                        })
                      : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            {colleaguesScanId && !viewing ? (
              <Pressable
                onPress={async () => {
                  try {
                    const code = await createShare(colleaguesScanId);
                    await RNShare.share({
                      message:
                        `Récupère tes horaires sur Clork sans re-scanner le planning ! ` +
                        `Ouvre l'app → Scanner → « J'ai reçu un code » et saisis : ${code.toUpperCase()}`,
                    });
                  } catch (error) {
                    Alert.alert("Partage impossible", error instanceof Error ? error.message : "Erreur");
                  }
                }}
                style={[styles.shareTeamButton, { backgroundColor: colors.accent }]}
              >
                <Ionicons name="share-outline" size={18} color={colors.onAccent} />
                <Text style={[styles.shareTeamLabel, { color: colors.onAccent }]}>
                  Partager ce planning à l'équipe
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Modal>
      ) : null}

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
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  iconPill: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
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
    color: "rgba(38,33,14,0.65)",
    fontSize: typeScale.caption,
    fontFamily: fonts.bold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  heroValue: {
    fontSize: typeScale.hero,
    fontFamily: fonts.black,
  },
  heroBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: "rgba(38,33,14,0.1)",
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
  colleaguesBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  colleaguesSheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: "70%",
    padding: spacing.lg,
    gap: spacing.md,
  },
  colleaguesTitle: {
    fontSize: typeScale.heading,
    fontFamily: fonts.black,
  },
  colleaguesList: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  colleagueRow: {
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  personRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    flexWrap: "wrap",
  },
  personChip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  personLabel: {
    fontSize: typeScale.caption,
    fontFamily: fonts.extraBold,
  },
  colleagueHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  colleagueDayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: spacing.xs,
  },
  shareTeamButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
  },
  shareTeamLabel: {
    fontSize: typeScale.body,
    fontFamily: fonts.extraBold,
  },
  colleagueDayLabel: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
    textTransform: "capitalize",
  },
  colleagueText: {
    flex: 1,
    gap: 1,
  },
  colleagueName: {
    fontSize: typeScale.body,
    fontFamily: fonts.extraBold,
  },
  colleagueMeta: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
  },
  colleagueDay: {
    fontSize: typeScale.caption,
    fontFamily: fonts.extraBold,
  },
});
