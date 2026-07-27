// Accueil v2 (maquette 4a) : segmented Aujourd'hui ⇄ Semaine, hero du jour
// (horaire géant), rappel de départ, raccourcis (Équipe / Exporter / suivi
// épinglé), « La suite », vue semaine avec navigation ‹ › et jour déplié,
// CTA flottant « + Ajouter mes horaires ». La logique de données (chargement,
// équipe, suivis, export, widgets, rappels) est reprise de la v1.

import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { DayRow, type DayRowSlot } from "@/components/week/DayRow";
import { FloatingCTA } from "@/components/ui/FloatingCTA";
import { Segmented } from "@/components/ui/Segmented";
import { ShiftEditorModal, type EditorTarget } from "@/components/week/ShiftEditorModal";
import {
  fonts,
  letterSpacing,
  radius,
  shiftPeriodLabel,
  shiftPeriodLabels,
  shiftTypeLabel,
  spacing,
  typeScale,
  useThemeColors,
} from "@/constants/tokens";
import { ensurePermission, exportWeek } from "@/lib/calendar-export";
import { isPremiumPlan, showPremiumGate, usePlan } from "@/lib/plan-service";
import { listFollowed, type FollowedUser } from "@/lib/follow-service";
import { getReminderPrefs, rescheduleFromShifts } from "@/lib/reminder-service";
import { findShiftMates, findTargetEmployee } from "@/lib/scan-service";
import { addDays, addMinutesToTime, mondayOf, toShortTime, weekLabel } from "@/lib/dates";
import { supabase } from "@/lib/supabase";
import { refreshWidgetSnapshot } from "@/lib/widget-data";
import type { ExtractionEmployee, PlanningExtraction } from "@/lib/extraction-types";
import type { Shift } from "@/lib/types";
import { useAuth } from "@/providers/auth-provider";

const DAY_LABELS = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"] as const;
const HERO_DAY_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const TIME_FORMATTER = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

function toLocalTime(iso: string): string {
  return TIME_FORMATTER.format(new Date(iso));
}

function formatBreak(minutes: number): string {
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h${minutes % 60 ? String(minutes % 60).padStart(2, "0") : ""}`
    : `${minutes} min`;
}

/** Heures payées d'un créneau (amplitude − pause) — réunions incluses. */
function paidHoursOf(shift: Shift): number {
  if (!shift.start_at || !shift.end_at) return 0;
  const span =
    (new Date(shift.end_at).getTime() - new Date(shift.start_at).getTime()) / 3_600_000;
  return Math.max(0, span - shift.break_minutes / 60);
}

function formatHours(value: number): string {
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}h`;
}

/** Ligne DayRow depuis les créneaux d'un jour. */
function toDayRowSlots(dayShifts: Shift[]): DayRowSlot[] {
  return dayShifts
    .filter((s) => s.start_at && s.end_at)
    .map((s) => ({
      start: toLocalTime(s.start_at as string),
      end: toLocalTime(s.end_at as string),
      type: s.type,
      paidLabel:
        s.type === "work"
          ? formatHours(paidHoursOf(s))
          : `${shiftTypeLabel[s.type]} · ${formatHours(paidHoursOf(s))}`,
    }));
}

export default function HomeScreen() {
  const colors = useThemeColors();
  const { session } = useAuth();
  const [view, setView] = useState<"today" | "week">("today");
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const plan = usePlan();
  const [displayName, setDisplayName] = useState("");
  const [colleagues, setColleagues] = useState<ExtractionEmployee[] | null>(null);
  const [expandedColleague, setExpandedColleague] = useState<number | null>(null);
  // Équipe de la semaine (scan validé) : qui ouvre/ferme avec moi.
  const [team, setTeam] = useState<{ employees: ExtractionEmployee[]; myRow: number | null } | null>(null);
  // Plannings suivis en lecture seule (ex : celui de sa compagne).
  const [followedList, setFollowedList] = useState<FollowedUser[]>([]);
  const [viewing, setViewing] = useState<FollowedUser | null>(null);
  const [morningReminder, setMorningReminder] = useState<string | null>(null);

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
    if (!viewing) {
      // Widgets : instantané ancré sur le JOUR J (semaine réelle + suivante),
      // jamais sur la semaine consultée — naviguer ne réécrit pas le widget.
      if (userId) {
        void refreshWidgetSnapshot(userId, {
          accent: colors.accent,
          onAccent: colors.onAccent,
        });
      }
      // Rappels locaux : seulement sur MON planning de la semaine courante.
      if (monday === mondayOf(new Date())) {
        void rescheduleFromShifts((data as Shift[]) ?? []);
      }
    }
  }, [userId, monday, sunday, viewing, colors.accent, colors.onAccent]);

  const loadTeam = useCallback(async () => {
    if (!userId || viewing) {
      setTeam(null);
      return;
    }
    const { data: scan } = await supabase
      .from("scans")
      .select("raw_extraction")
      .eq("week_start", monday)
      .eq("status", "validated")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ raw_extraction: PlanningExtraction | null }>();
    const employees = scan?.raw_extraction?.employees;
    if (!employees || employees.length === 0) {
      setTeam(null);
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("employee_aliases, display_name")
      .eq("id", userId)
      .single<{ employee_aliases: string[]; display_name: string }>();
    const myRow =
      findTargetEmployee(employees, profile?.employee_aliases ?? [], profile?.display_name ?? "")
        ?.row_index ?? null;
    setTeam({ employees, myRow });
  }, [userId, monday, viewing]);

  useFocusEffect(
    useCallback(() => {
      loadShifts();
      loadTeam();
      listFollowed().then(setFollowedList);
    }, [loadShifts, loadTeam]),
  );

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .single<{ display_name: string }>()
      .then(({ data }) => setDisplayName(data?.display_name ?? ""));
  }, [userId]);

  useEffect(() => {
    getReminderPrefs().then((prefs) =>
      setMorningReminder(prefs.morningEnabled ? prefs.morningTime : null),
    );
  }, []);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const date = addDays(monday, i);
        return { date, shifts: shifts.filter((s) => s.date === date) };
      }),
    [monday, shifts],
  );

  // Heures payées de la semaine affichée (réunions/formations comprises).
  const weekHours = useMemo(
    () =>
      shifts
        .filter((s) => s.type === "work" || s.type === "meeting" || s.type === "training")
        .reduce((acc, s) => acc + paidHoursOf(s), 0),
    [shifts],
  );

  async function openColleagues() {
    const { data } = await supabase
      .from("scans")
      .select("id, raw_extraction")
      .eq("week_start", monday)
      .eq("status", "validated")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; raw_extraction: PlanningExtraction | null }>();
    const employees = data?.raw_extraction?.employees;
    if (!employees || employees.length === 0) {
      Alert.alert(
        "Pas de planning d'équipe",
        "Aucun scan validé pour cette semaine — scanne le planning pour voir les horaires des collègues.",
      );
      return;
    }
    if (!isPremiumPlan(plan)) {
      showPremiumGate("Le planning de toute l'équipe");
      return;
    }
    setColleagues(employees);
  }

  async function handleExport() {
    if (!isPremiumPlan(plan)) {
      showPremiumGate("L'export vers ton calendrier");
      return;
    }
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

  // --- Données du jour (vue Aujourd'hui) -------------------------------------
  const todayShifts = useMemo(
    () => shifts.filter((s) => s.date === todayIso),
    [shifts, todayIso],
  );
  const mainToday = todayShifts.find((s) => s.type === "work" && s.start_at && s.end_at);
  const heroShift = mainToday ?? todayShifts.find((s) => s.start_at && s.end_at);
  const heroStatus = todayShifts.find((s) => !s.start_at);

  // « Départ dans 1h10 — rappel à 8:15 » : prochain début à venir aujourd'hui.
  const departure = useMemo(() => {
    if (viewing) return null;
    const next = todayShifts
      .filter((s) => s.start_at && new Date(s.start_at).getTime() > Date.now())
      .sort((a, b) => (a.start_at as string).localeCompare(b.start_at as string))[0];
    if (!next?.start_at) return null;
    const minutes = Math.round((new Date(next.start_at).getTime() - Date.now()) / 60_000);
    if (minutes <= 0 || minutes > 12 * 60) return null;
    const label =
      minutes >= 60 ? `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}` : `${minutes} min`;
    return `Départ dans ${label}${morningReminder ? ` — rappel à ${morningReminder}` : ""}`;
  }, [todayShifts, viewing, morningReminder]);

  // 3 prochains jours à partir de demain (la suite).
  const upcoming = useMemo(() => {
    const startIndex = days.findIndex((d) => d.date > todayIso);
    const source = startIndex === -1 ? [] : days.slice(startIndex);
    return source.slice(0, 3);
  }, [days, todayIso]);

  const initial = (viewing?.displayName ?? displayName ?? "C").charAt(0).toUpperCase() || "C";
  const pinnedFollow = followedList[0] ?? null;

  function openDayEditor(date: string, dayShifts: Shift[]) {
    if (viewing) return;
    if (dayShifts.length === 1) {
      setEditorTarget({ mode: "edit", shift: dayShifts[0] });
    } else if (dayShifts.length === 0 && userId) {
      setEditorTarget({ mode: "create", date, userId });
    } else {
      // Multi-créneaux : la vue semaine déplie le jour pour choisir.
      setView("week");
      setExpandedDay(date);
    }
  }

  // --- Rendus partagés ---------------------------------------------------------
  const topBar = (
    <View style={styles.topBar}>
      <Segmented
        options={[
          { value: "today", label: "Aujourd'hui" },
          { value: "week", label: "Semaine" },
        ]}
        value={view}
        onChange={(next) => {
          setView(next);
          if (next === "week") setMonday(mondayOf(new Date()));
        }}
      />
      <Pressable
        accessibilityLabel="Profil"
        onPress={() => router.navigate("/(tabs)/profile")}
        style={[styles.avatar, { backgroundColor: colors.accent }]}
      >
        <Text style={[styles.avatarLetter, { color: colors.onAccent }]}>{initial}</Text>
      </Pressable>
    </View>
  );

  const viewingBanner = viewing ? (
    <View style={[styles.viewingBanner, { backgroundColor: colors.accentMuted }]}>
      <Ionicons name="eye-outline" size={15} color={colors.accentDeep} />
      <Text style={[styles.viewingText, { color: colors.accentDeep }]} numberOfLines={1}>
        Lecture seule — planning de {viewing.displayName}
      </Text>
      <Pressable onPress={() => setViewing(null)} hitSlop={8}>
        <Text style={[styles.viewingBack, { color: colors.accentDeep }]}>Revenir à moi</Text>
      </Pressable>
    </View>
  ) : null;

  const shortcuts = (
    <View style={styles.shortcutRow}>
      <Pressable
        onPress={openColleagues}
        style={[styles.shortcut, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <Ionicons name="people-outline" size={18} color={colors.accent} />
        <Text style={[styles.shortcutLabel, { color: colors.textSoft }]}>Équipe</Text>
      </Pressable>
      <Pressable
        onPress={handleExport}
        disabled={isExporting}
        style={[
          styles.shortcut,
          { backgroundColor: colors.surface, borderColor: colors.border, opacity: isExporting ? 0.5 : 1 },
        ]}
      >
        <Ionicons name="share-outline" size={18} color={colors.accent} />
        <Text style={[styles.shortcutLabel, { color: colors.textSoft }]}>Exporter</Text>
      </Pressable>
      {pinnedFollow ? (
        <Pressable
          onPress={() => setViewing(viewing ? null : pinnedFollow)}
          style={[
            styles.shortcut,
            viewing
              ? { backgroundColor: colors.accentMuted, borderColor: colors.accent }
              : { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Ionicons name="heart-outline" size={18} color={colors.accent} />
          <Text style={[styles.shortcutLabel, { color: colors.textSoft }]} numberOfLines={1}>
            {pinnedFollow.displayName}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView edges={["top"]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {view === "today" ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {topBar}
          {viewingBanner}

          {/* Hero du jour */}
          <View style={styles.hero}>
            <Text style={[styles.heroKicker, { color: colors.accent }]}>
              {HERO_DAY_FORMATTER.format(new Date(`${todayIso}T12:00:00`)).toUpperCase()}
            </Text>
            {heroShift?.start_at && heroShift.end_at ? (
              <>
                <Text style={[styles.heroTime, { color: colors.text }]}>
                  {toLocalTime(heroShift.start_at)} → {toLocalTime(heroShift.end_at)}
                </Text>
                <View style={styles.heroChips}>
                  <View style={[styles.chipStrong, { backgroundColor: colors.accentMuted }]}>
                    <Text style={[styles.chipStrongText, { color: colors.accent }]}>
                      {shiftTypeLabel[heroShift.type]}
                      {heroShift.type === "work"
                        ? ` · ${
                            heroShift.period
                              ? shiftPeriodLabels[heroShift.period]
                              : shiftPeriodLabel(
                                  toLocalTime(heroShift.start_at),
                                  toLocalTime(heroShift.end_at),
                                ) ?? ""
                          }`
                        : ""}
                    </Text>
                  </View>
                  {heroShift.break_minutes > 0 ? (
                    <View style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Text style={[styles.chipText, { color: colors.textSoft }]}>
                        Pause {formatBreak(heroShift.break_minutes)}
                        {heroShift.break_start ? ` à ${toShortTime(heroShift.break_start)}` : ""}
                      </Text>
                    </View>
                  ) : null}
                  <View style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.chipText, { color: colors.textSoft }]}>
                      {formatHours(paidHoursOf(heroShift))} payées
                    </Text>
                  </View>
                </View>
                {todayShifts.filter((s) => s.id !== heroShift.id && s.start_at && s.end_at)
                  .map((s) => (
                    <Text key={s.id} style={[styles.heroExtra, { color: colors.textSoft }]}>
                      Puis {toLocalTime(s.start_at as string)} – {toLocalTime(s.end_at as string)} ·{" "}
                      {shiftTypeLabel[s.type]}
                    </Text>
                  ))}
              </>
            ) : (
              <>
                <Text style={[styles.heroTime, { color: colors.text }]}>
                  {heroStatus ? shiftTypeLabel[heroStatus.type] : "Repos"}
                </Text>
                <Text style={[styles.heroExtra, { color: colors.textMuted }]}>
                  {heroStatus && heroStatus.type !== "off"
                    ? "Journée sans horaires précis."
                    : "Rien de prévu aujourd'hui — profite."}
                </Text>
              </>
            )}
          </View>

          {departure ? (
            <View style={[styles.reminderCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.reminderDot, { backgroundColor: colors.accent }]} />
              <Text style={[styles.reminderText, { color: colors.textSoft }]}>{departure}</Text>
            </View>
          ) : null}

          {shortcuts}

          {/* La suite */}
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>La suite</Text>
            <Pressable onPress={() => setView("week")} hitSlop={8}>
              <Text style={[styles.sectionMeta, { color: colors.accent }]}>
                Semaine · {formatHours(weekHours)}
              </Text>
            </Pressable>
          </View>
          <View style={styles.dayList}>
            {upcoming.map(({ date, shifts: dayShifts }) => (
              <DayRow
                key={date}
                dayLabel={DAY_LABELS[days.findIndex((d) => d.date === date)]}
                dayNumber={date.slice(8)}
                slots={toDayRowSlots(dayShifts)}
                status={dayShifts.some((s) => s.start_at) ? "work" : "off"}
                readOnly={!!viewing}
                onPress={() => openDayEditor(date, dayShifts)}
              />
            ))}
            {upcoming.length === 0 ? (
              <Text style={[styles.emptyNote, { color: colors.textMuted }]}>
                Fin de semaine — la suite arrive avec ton prochain planning.
              </Text>
            ) : null}
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {topBar}
          {viewingBanner}

          {/* Navigation de semaine */}
          <View style={styles.weekNav}>
            <Pressable
              accessibilityLabel="Semaine précédente"
              onPress={() => setMonday((c) => addDays(c, -7))}
              style={[styles.navButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Ionicons name="chevron-back" size={20} color={colors.text} />
            </Pressable>
            <Pressable onPress={() => setMonday(mondayOf(new Date()))} style={styles.weekNavCenter}>
              <Text style={[styles.weekNavLabel, { color: colors.text }]}>{weekLabel(monday)}</Text>
              <Text style={[styles.weekNavSub, { color: colors.textMuted }]}>
                {monday === mondayOf(new Date())
                  ? "cette semaine"
                  : monday === addDays(mondayOf(new Date()), 7)
                    ? "semaine prochaine"
                    : " "}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Semaine suivante"
              onPress={() => setMonday((c) => addDays(c, 7))}
              style={[styles.navButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Ionicons name="chevron-forward" size={20} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.weekTotal}>
            <Text style={[styles.weekTotalValue, { color: colors.accent }]}>
              {formatHours(weekHours)}
            </Text>
            <Text style={[styles.weekTotalLabel, { color: colors.textMuted }]}>
              {" "}payées cette semaine
            </Text>
          </View>

          <View style={styles.dayList}>
            {days.map(({ date, shifts: dayShifts }, index) => {
              const isExpanded = expandedDay === date;
              const first = dayShifts.find((s) => s.start_at && s.end_at);
              if (!isExpanded || !first) {
                return (
                  <DayRow
                    key={date}
                    dayLabel={DAY_LABELS[index]}
                    dayNumber={date.slice(8)}
                    slots={toDayRowSlots(dayShifts)}
                    status={dayShifts.some((s) => s.start_at) ? "work" : "off"}
                    readOnly={!!viewing}
                    onPress={() =>
                      dayShifts.length === 0 && !viewing && userId
                        ? setEditorTarget({ mode: "create", date, userId })
                        : setExpandedDay(isExpanded ? null : date)
                    }
                  />
                );
              }
              // Jour déplié : détails + équipe + « Modifier ce jour ».
              const mates = team
                ? findShiftMates(
                    team.employees,
                    team.myRow,
                    date,
                    first.start_at ? toLocalTime(first.start_at) : null,
                    first.end_at ? toLocalTime(first.end_at) : null,
                  )
                : { openers: [], closers: [] };
              return (
                <Pressable
                  key={date}
                  onPress={() => setExpandedDay(null)}
                  style={[styles.expandedCard, { backgroundColor: colors.surface, borderColor: colors.accent }]}
                >
                  <View style={styles.expandedHeader}>
                    <View style={[styles.dateSquare, { backgroundColor: colors.background }]}>
                      <Text style={[styles.dateDay, { color: colors.textMuted }]}>
                        {DAY_LABELS[index]}
                      </Text>
                      <Text style={[styles.dateNumber, { color: colors.text }]}>{date.slice(8)}</Text>
                    </View>
                    <Text style={[styles.expandedTime, { color: colors.text }]}>
                      {dayShifts
                        .filter((s) => s.start_at && s.end_at)
                        .map((s) => `${toLocalTime(s.start_at as string)} – ${toLocalTime(s.end_at as string)}`)
                        .join(" · ")}
                    </Text>
                    <Ionicons name="chevron-up" size={16} color={colors.textMuted} />
                  </View>

                  <View style={[styles.expandedDetails, { borderTopColor: colors.separator }]}>
                    <View style={styles.expandedRow}>
                      <Text style={[styles.expandedDetail, { color: colors.textSoft }]}>
                        {first.break_minutes > 0
                          ? `Pause ${formatBreak(first.break_minutes)}${first.break_start ? ` à ${toShortTime(first.break_start)}` : ""}`
                          : "Pas de pause"}
                      </Text>
                      <Text style={[styles.expandedPaid, { color: colors.accent }]}>
                        {formatHours(dayShifts.reduce((acc, s) => acc + paidHoursOf(s), 0))} payées
                      </Text>
                    </View>
                    {mates.openers.length > 0 ? (
                      <View style={styles.matesRow}>
                        <Text style={[styles.expandedDetail, { color: colors.textSoft }]}>Ouverture avec</Text>
                        {mates.openers.slice(0, 3).map((name) => (
                          <View key={name} style={[styles.mateChip, { backgroundColor: colors.background }]}>
                            <Text style={[styles.mateChipText, { color: colors.text }]} numberOfLines={1}>
                              {name.split(" ").pop()}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {mates.closers.length > 0 ? (
                      <View style={styles.matesRow}>
                        <Text style={[styles.expandedDetail, { color: colors.textSoft }]}>Fermeture par</Text>
                        {mates.closers.slice(0, 3).map((name) => (
                          <View key={name} style={[styles.mateChip, { backgroundColor: colors.background }]}>
                            <Text style={[styles.mateChipText, { color: colors.text }]} numberOfLines={1}>
                              {name.split(" ").pop()}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {!viewing ? (
                      <Pressable
                        onPress={() => setEditorTarget({ mode: "edit", shift: first })}
                        style={[styles.modifyButton, { backgroundColor: colors.ink }]}
                      >
                        <Text style={[styles.modifyLabel, { color: colors.onInk }]}>Modifier ce jour</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {shortcuts}
          <Text style={[styles.footNote, { color: colors.textMuted }]}>
            Touche un jour pour le modifier
          </Text>
        </ScrollView>
      )}

      {!viewing ? (
        <FloatingCTA label="＋ Ajouter mes horaires" onPress={() => router.navigate("/(tabs)/scan")} />
      ) : null}

      {/* Feuille équipe (collègues du scan de la semaine) */}
      {colleagues ? (
        <Modal visible transparent animationType="slide" onRequestClose={() => setColleagues(null)}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setColleagues(null)} />
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>
                L'équipe · {weekLabel(monday)}
              </Text>
              <Pressable
                onPress={() => setColleagues(null)}
                hitSlop={10}
                accessibilityLabel="Fermer"
                style={[styles.sheetClose, { backgroundColor: colors.surface }]}
              >
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.sheetList}>
              {colleagues.map((employee) => {
                const isOpen = expandedColleague === employee.row_index;
                return (
                  <Pressable
                    key={employee.row_index}
                    onPress={() => setExpandedColleague(isOpen ? null : employee.row_index)}
                    style={[styles.colleagueRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
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
                      <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
                    </View>
                    {isOpen
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
                            <View key={day.day_index} style={[styles.colleagueDayRow, { borderTopColor: colors.separator }]}>
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
          </View>
        </Modal>
      ) : null}

      {editorTarget ? (
        <ShiftEditorModal
          target={editorTarget}
          onClose={(didChange) => {
            setEditorTarget(null);
            if (didChange) loadShifts();
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: 120,
    gap: spacing.md + 4,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    fontSize: typeScale.body,
    fontFamily: fonts.bold,
  },
  viewingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  viewingText: {
    flex: 1,
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
  },
  viewingBack: {
    fontSize: typeScale.caption,
    fontFamily: fonts.bold,
  },
  hero: {
    gap: 6,
  },
  heroKicker: {
    fontSize: 11.5,
    fontFamily: fonts.semiBold,
    letterSpacing: 0.4,
  },
  heroTime: {
    fontSize: typeScale.hero,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.title,
  },
  heroChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  chipStrong: {
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  chipStrongText: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
  },
  chip: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  chipText: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
  },
  heroExtra: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
    marginTop: 2,
  },
  reminderCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  reminderDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  reminderText: {
    flex: 1,
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
  },
  shortcutRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  shortcut: {
    flex: 1,
    alignItems: "center",
    gap: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingVertical: 12,
  },
  shortcutLabel: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  sectionTitle: {
    fontSize: typeScale.heading,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.heading,
  },
  sectionMeta: {
    fontSize: typeScale.caption,
    fontFamily: fonts.bold,
  },
  dayList: {
    gap: spacing.sm,
  },
  emptyNote: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.regular,
    textAlign: "center",
    paddingVertical: spacing.md,
  },
  weekNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navButton: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  weekNavCenter: {
    alignItems: "center",
    gap: 1,
  },
  weekNavLabel: {
    fontSize: typeScale.body + 1,
    fontFamily: fonts.bold,
  },
  weekNavSub: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.medium,
  },
  weekTotal: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
  },
  weekTotalValue: {
    fontSize: 35,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.title,
  },
  weekTotalLabel: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
  },
  expandedCard: {
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  expandedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dateSquare: {
    width: 48,
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  dateDay: {
    fontSize: 10.5,
    fontFamily: fonts.semiBold,
  },
  dateNumber: {
    fontSize: 17,
    fontFamily: fonts.bold,
  },
  expandedTime: {
    flex: 1,
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
  },
  expandedDetails: {
    borderTopWidth: 1,
    paddingTop: 9,
    gap: 7,
  },
  expandedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  expandedDetail: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
  },
  expandedPaid: {
    fontSize: typeScale.caption,
    fontFamily: fonts.bold,
  },
  matesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  mateChip: {
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  mateChipText: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
  },
  modifyButton: {
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
    marginTop: 2,
  },
  modifyLabel: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
  },
  footNote: {
    fontSize: typeScale.caption,
    fontFamily: fonts.regular,
    textAlign: "center",
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(23,21,14,0.4)",
  },
  sheet: {
    maxHeight: "75%",
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.md,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sheetTitle: {
    fontSize: typeScale.heading,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.heading,
  },
  sheetClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetList: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  colleagueRow: {
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  colleagueHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  colleagueText: {
    flex: 1,
    gap: 1,
  },
  colleagueName: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
  },
  colleagueMeta: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.medium,
  },
  colleagueDayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    paddingTop: 6,
  },
  colleagueDayLabel: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
  },
  colleagueDay: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
  },
});
