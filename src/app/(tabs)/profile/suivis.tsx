// Mode conjoint — « Plannings suivis » (maquette v2) : chips de personnes
// (Moi + suivis), semaine COURANTE de la personne sélectionnée en DayRow
// lecture seule (jour J entouré d'accent), bannière lecture seule, toggle
// « planning par défaut » (un seul, optimiste), note covoiturage quand nos
// heures de fin (ou de début) sont à ≤ 30 min d'écart, et « Ne plus suivre ».

import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SubPageHeader } from "@/components/profile/SubPageHeader";
import { DayRow, type DayRowSlot } from "@/components/week/DayRow";
import {
  fonts,
  letterSpacing,
  radius,
  shiftTypeLabel,
  spacing,
  typeScale,
  useThemeColors,
} from "@/constants/tokens";
import { addDays, isoDate, mondayOf, weekLabel } from "@/lib/dates";
import {
  listFollowed,
  setDefaultView,
  unfollowUser,
  type FollowedUser,
} from "@/lib/follow-service";
import { supabase } from "@/lib/supabase";
import type { Shift } from "@/lib/types";
import { useAuth } from "@/providers/auth-provider";

const DAY_LABELS = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"] as const;
const FULL_DAY_NAMES = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
] as const;

// Note covoiturage : écart max considéré comme « proche », arrondi affiché.
const CLOSE_GAP_MAX_MINUTES = 30;
const GAP_ROUND_MINUTES = 5;

const TIME_FORMATTER = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

function toLocalTime(iso: string): string {
  return TIME_FORMATTER.format(new Date(iso));
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

/** Ligne DayRow depuis les créneaux d'un jour (même rendu que l'accueil). */
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

function minutesOfDay(iso: string): number {
  const date = new Date(iso);
  return date.getHours() * 60 + date.getMinutes();
}

type CarpoolMatch = { dayIndex: number; kind: "end" | "start"; gapMinutes: number };

/** Fin la plus tardive (kind end) ou début le plus tôt (kind start) du jour. */
function edgeTimeOf(dayShifts: Shift[], kind: "end" | "start"): number | null {
  const times = dayShifts
    .filter((s) => s.start_at && s.end_at)
    .map((s) => minutesOfDay((kind === "end" ? s.end_at : s.start_at) as string));
  if (times.length === 0) return null;
  return kind === "end" ? Math.max(...times) : Math.min(...times);
}

/**
 * Premier jour de la semaine où nos heures de FIN sont à ≤ 30 min d'écart
 * (priorité), sinon idem sur les heures de DÉBUT.
 */
function findCarpoolMatch(mine: Shift[], theirs: Shift[], monday: string): CarpoolMatch | null {
  for (const kind of ["end", "start"] as const) {
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const date = addDays(monday, dayIndex);
      const myTime = edgeTimeOf(mine.filter((s) => s.date === date), kind);
      const theirTime = edgeTimeOf(theirs.filter((s) => s.date === date), kind);
      if (myTime == null || theirTime == null) continue;
      const gapMinutes = Math.abs(myTime - theirTime);
      if (gapMinutes <= CLOSE_GAP_MAX_MINUTES) return { dayIndex, kind, gapMinutes };
    }
  }
  return null;
}

export default function FollowedPlanningsScreen() {
  const colors = useThemeColors();
  const { session } = useAuth();
  const userId = session?.user.id;

  const [followed, setFollowed] = useState<FollowedUser[]>([]);
  // Arrivée depuis Partage & suivi : ouvrir directement sur la personne cliquée.
  const params = useLocalSearchParams<{ personId?: string }>();
  // null = « Moi » ; sinon id d'une personne suivie.
  const [selectedId, setSelectedId] = useState<string | null>(
    typeof params.personId === "string" ? params.personId : null,
  );
  const [weekShifts, setWeekShifts] = useState<Shift[]>([]);

  // Semaine COURANTE uniquement — pas de navigation sur cet écran.
  const monday = useMemo(() => mondayOf(new Date()), []);
  const sunday = useMemo(() => addDays(monday, 6), [monday]);
  const todayIso = isoDate(new Date());

  const selected = followed.find((f) => f.id === selectedId) ?? null;

  const reloadFollowed = useCallback(async () => {
    const list = await listFollowed();
    setFollowed(list);
    // Personne sélectionnée disparue (suivi retiré) → retour à Moi.
    setSelectedId((current) =>
      current && !list.some((f) => f.id === current) ? null : current,
    );
  }, []);

  // Mes créneaux TOUJOURS chargés (pour la note covoiturage) + ceux de la
  // personne sélectionnée. Les RLS autorisent la lecture des plannings suivis.
  const loadShifts = useCallback(async () => {
    if (!userId) return;
    const ids = selectedId ? [userId, selectedId] : [userId];
    const { data } = await supabase
      .from("shifts")
      .select("*")
      .in("user_id", ids)
      .gte("date", monday)
      .lte("date", sunday)
      .order("date")
      .order("start_at");
    setWeekShifts((data as Shift[]) ?? []);
  }, [userId, selectedId, monday, sunday]);

  useFocusEffect(
    useCallback(() => {
      void reloadFollowed();
      void loadShifts();
    }, [reloadFollowed, loadShifts]),
  );

  const personShifts = useMemo(
    () => weekShifts.filter((s) => s.user_id === (selectedId ?? userId)),
    [weekShifts, selectedId, userId],
  );
  const myShifts = useMemo(
    () => weekShifts.filter((s) => s.user_id === userId),
    [weekShifts, userId],
  );

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = addDays(monday, index);
        return { date, index, shifts: personShifts.filter((s) => s.date === date) };
      }),
    [monday, personShifts],
  );

  const carpoolText = useMemo(() => {
    if (!selected) return null;
    const match = findCarpoolMatch(myShifts, personShifts, monday);
    if (!match) return null;
    const rounded = Math.round(match.gapMinutes / GAP_ROUND_MINUTES) * GAP_ROUND_MINUTES;
    const verb = match.kind === "end" ? "vous finissez" : "vous commencez";
    const gapLabel = rounded === 0 ? "en même temps" : `à ${rounded} min d'écart`;
    return `${FULL_DAY_NAMES[match.dayIndex]} ${verb} ${gapLabel} — covoiturage ?`;
  }, [selected, myShifts, personShifts, monday]);

  async function toggleDefault(user: FollowedUser, next: boolean) {
    // Optimiste : un seul défaut — activer ici désactive les autres.
    setFollowed((current) =>
      current.map((f) => ({ ...f, isDefaultView: next && f.id === user.id })),
    );
    try {
      await setDefaultView(next ? user.id : null);
    } catch (error) {
      void reloadFollowed();
      Alert.alert("Impossible", error instanceof Error ? error.message : "Erreur inconnue");
    }
  }

  function confirmUnfollow(user: FollowedUser) {
    Alert.alert(
      `Ne plus suivre ${user.displayName} ?`,
      "Tu ne verras plus son planning. Tu pourras le re-suivre avec son code.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Ne plus suivre",
          style: "destructive",
          onPress: async () => {
            await unfollowUser(user.id);
            setSelectedId(null);
            await reloadFollowed();
          },
        },
      ],
    );
  }

  function renderChip(key: string, label: string, isActive: boolean, onPress: () => void) {
    return (
      <Pressable
        key={key}
        accessibilityRole="button"
        accessibilityState={{ selected: isActive }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.chip,
          isActive
            ? { backgroundColor: colors.accent, borderColor: colors.accent }
            : { backgroundColor: colors.surface, borderColor: colors.border },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Text
          style={[styles.chipLabel, { color: isActive ? colors.onAccent : colors.textSoft }]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Pressable>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SubPageHeader title="Plannings suivis" />

        {/* Chips de personnes : Moi + chaque planning suivi. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={styles.chipRow}
        >
          {renderChip("me", "Moi", selectedId === null, () => setSelectedId(null))}
          {followed.map((user) =>
            renderChip(user.id, user.displayName, selectedId === user.id, () =>
              setSelectedId(user.id),
            ),
          )}
        </ScrollView>

        {followed.length === 0 ? (
          <Text style={[styles.emptyHint, { color: colors.textMuted }]}>
            Tu ne suis encore personne — saisis le code d'un·e proche dans
            Partage &amp; suivi pour voir son planning ici.
          </Text>
        ) : null}

        {/* Titre de section + plage de la semaine courante. */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]} numberOfLines={1}>
            {selected ? `Semaine de ${selected.displayName}` : "Ma semaine"}
          </Text>
          <Text style={[styles.sectionRange, { color: colors.textMuted }]}>
            {weekLabel(monday)}
          </Text>
        </View>

        {/* Masquée quand c'est MA vue par défaut : l'info est déjà évidente. */}
        {selected && !selected.isDefaultView ? (
          <View style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.dot, { backgroundColor: colors.accent }]} />
            <Text style={[styles.bannerText, { color: colors.textSoft }]} numberOfLines={2}>
              Lecture seule — {selected.displayName} partage son planning avec toi
            </Text>
          </View>
        ) : null}

        {selected ? (
          <View style={[styles.toggleCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.toggleText}>
              <Text style={[styles.toggleLabel, { color: colors.text }]}>
                Afficher ce planning par défaut
              </Text>
              <Text style={[styles.toggleHint, { color: colors.textMuted }]}>
                L'app s'ouvrira sur la semaine de {selected.displayName}, pas la tienne
              </Text>
            </View>
            <Switch
              value={selected.isDefaultView}
              onValueChange={(next) => toggleDefault(selected, next)}
              trackColor={{ true: colors.accent, false: colors.surfaceMuted }}
              thumbColor="#FFFFFF"
            />
          </View>
        ) : null}

        {/* Les 7 jours de la semaine courante — jour J entouré d'accent. */}
        <View style={styles.dayList}>
          {days.map(({ date, index, shifts: dayShifts }) => {
            const isToday = date === todayIso;
            return (
              <View
                key={date}
                style={isToday ? [styles.todayOutline, { borderColor: colors.accent }] : null}
              >
                <DayRow
                  dayLabel={DAY_LABELS[index]}
                  dayNumber={date.slice(8)}
                  slots={toDayRowSlots(dayShifts)}
                  status={dayShifts.some((s) => s.start_at) ? "work" : "off"}
                  readOnly
                />
              </View>
            );
          })}
        </View>

        {carpoolText ? (
          <View style={[styles.carpoolCard, { backgroundColor: colors.accentMuted }]}>
            <View style={[styles.dot, { backgroundColor: colors.accent }]} />
            <Text style={[styles.carpoolText, { color: colors.accentDeep }]}>{carpoolText}</Text>
          </View>
        ) : null}

        {selected ? (
          <Pressable onPress={() => confirmUnfollow(selected)} hitSlop={8} style={styles.unfollowRow}>
            <Text style={[styles.unfollowLabel, { color: colors.danger }]}>
              Ne plus suivre {selected.displayName}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  // Le rail des chips déborde du padding pour scroller bord à bord.
  chipScroll: {
    marginHorizontal: -spacing.lg,
  },
  chipRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxWidth: 160,
  },
  chipLabel: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
  },
  emptyHint: {
    fontSize: typeScale.caption,
    fontFamily: fonts.regular,
    lineHeight: 18,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  sectionTitle: {
    flexShrink: 1,
    fontSize: typeScale.heading,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.heading,
  },
  sectionRange: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bannerText: {
    flex: 1,
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  toggleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  toggleText: {
    flex: 1,
    gap: 2,
  },
  toggleLabel: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
  },
  toggleHint: {
    fontSize: typeScale.caption,
    fontFamily: fonts.regular,
    lineHeight: 17,
  },
  dayList: {
    gap: spacing.sm,
  },
  todayOutline: {
    borderWidth: 1.5,
    borderRadius: 15,
    padding: 2,
  },
  carpoolCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  carpoolText: {
    flex: 1,
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
  },
  unfollowRow: {
    alignSelf: "center",
    paddingVertical: spacing.sm,
  },
  unfollowLabel: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
  },
});
