import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  radius,
  shiftTypeColor,
  shiftTypeLabel,
  spacing,
  typeScale,
  useThemeColors,
} from "@/constants/tokens";
import { supabase } from "@/lib/supabase";
import type { Shift } from "@/lib/types";
import { useAuth } from "@/providers/auth-provider";

const DAY_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const TIME_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
});

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default function WeekScreen() {
  const colors = useThemeColors();
  const { session } = useAuth();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const userId = session?.user.id;

  const loadShifts = useCallback(async () => {
    if (!userId) return;
    const from = new Date();
    from.setDate(from.getDate() - 7);
    const to = new Date();
    to.setDate(to.getDate() + 21);
    const { data } = await supabase
      .from("shifts")
      .select("*")
      .eq("user_id", userId)
      .gte("date", isoDate(from))
      .lte("date", isoDate(to))
      .order("date")
      .order("start_at");
    setShifts((data as Shift[]) ?? []);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      loadShifts();
    }, [loadShifts]),
  );

  async function handleRefresh() {
    setIsRefreshing(true);
    await loadShifts();
    setIsRefreshing(false);
  }

  const byDate = useMemo(() => {
    const groups = new Map<string, Shift[]>();
    for (const shift of shifts) {
      const list = groups.get(shift.date) ?? [];
      list.push(shift);
      groups.set(shift.date, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [shifts]);

  const weekHours = useMemo(
    () =>
      shifts
        .filter((s) => s.type === "work" && s.start_at && s.end_at)
        .reduce(
          (acc, s) =>
            acc +
            (new Date(s.end_at as string).getTime() -
              new Date(s.start_at as string).getTime()) /
              3_600_000,
          0,
        ),
    [shifts],
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent}
          />
        }
      >
        <Text style={[styles.title, { color: colors.text }]}>Ma semaine</Text>

        {shifts.length > 0 ? (
          <View style={[styles.heroCard, { backgroundColor: colors.accent }]}>
            <Text style={styles.heroLabel}>Heures à venir</Text>
            <Text style={styles.heroValue}>
              {weekHours.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}h
            </Text>
          </View>
        ) : null}

        {byDate.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-clear-outline" size={56} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              Aucun horaire pour l'instant
            </Text>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              Scanne le planning affiché au magasin depuis l'onglet Scanner : tes
              horaires apparaîtront ici.
            </Text>
          </View>
        ) : (
          byDate.map(([date, dayShifts]) => (
            <View key={date} style={styles.daySection}>
              <Text style={[styles.dayLabel, { color: colors.textMuted }]}>
                {DAY_FORMATTER.format(new Date(`${date}T12:00:00`))}
              </Text>
              {dayShifts.map((shift) => (
                <View
                  key={shift.id}
                  style={[
                    styles.shiftCard,
                    {
                      backgroundColor: colors.surface,
                      borderLeftColor: shiftTypeColor[shift.type],
                    },
                  ]}
                >
                  <View style={styles.shiftMain}>
                    <Text style={[styles.shiftType, { color: colors.text }]}>
                      {shiftTypeLabel[shift.type]}
                      {shift.is_edited ? " ✍️" : ""}
                    </Text>
                    {shift.note ? (
                      <Text
                        style={[styles.shiftNote, { color: colors.textMuted }]}
                        numberOfLines={1}
                      >
                        {shift.note}
                      </Text>
                    ) : null}
                  </View>
                  {shift.start_at && shift.end_at ? (
                    <Text style={[styles.shiftTime, { color: colors.text }]}>
                      {TIME_FORMATTER.format(new Date(shift.start_at))} –{" "}
                      {TIME_FORMATTER.format(new Date(shift.end_at))}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    flexGrow: 1,
  },
  title: {
    fontSize: typeScale.title,
    fontWeight: "800",
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
  daySection: {
    gap: spacing.xs,
  },
  dayLabel: {
    fontSize: typeScale.caption,
    fontWeight: "700",
    textTransform: "capitalize",
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
  shiftTime: {
    fontSize: typeScale.body,
    fontWeight: "800",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  emptyTitle: {
    fontSize: typeScale.heading,
    fontWeight: "700",
  },
  emptyText: {
    fontSize: typeScale.body,
    textAlign: "center",
    lineHeight: 22,
  },
});
