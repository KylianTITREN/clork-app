// Écran « L'équipe » (pleine page, maquette v2) : bandeau de 7 jours, une
// carte par employé du scan validé de la semaine COURANTE (moi en premier),
// dépliage de la semaine complète dans la carte, verrou Premium (silhouettes)
// et CTA « Envoyer le code à l'équipe » (partage par code, premium-gaté).
// Mode conjoint (planning suivi) : pas de « (toi) », pas d'envoi de code, et
// l'accès dépend du plan de la personne SUIVIE (verrou sans déblocage) — la
// RLS applique la même règle côté serveur.

import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import {
  fonts,
  letterSpacing,
  radius,
  spacing,
  typeScale,
  useThemeColors,
} from "@/constants/tokens";
import { addDays, mondayOf } from "@/lib/dates";
import type {
  ExtractionDay,
  ExtractionEmployee,
  PlanningExtraction,
} from "@/lib/extraction-types";
import {
  fetchPlan,
  isPremiumPlan,
  showPremiumGate,
  usePlan,
  type Plan,
} from "@/lib/plan-service";
import { findTargetEmployee } from "@/lib/scan-service";
import { createShare } from "@/lib/share-service";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

const DAY_LABELS = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"] as const;
const DAY_ROW_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"] as const;
const WEEK_OF_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
});
const SECTION_DAY_FORMATTER = new Intl.DateTimeFormat("fr-FR", { weekday: "long" });

/** Numéro du jour sans zéro de tête ("2026-08-02" → "2"). */
function dayNumber(iso: string): string {
  return String(Number(iso.slice(8)));
}

type DaySchedule = {
  label: string;
  isWork: boolean;
};

/** Libellé d'horaire d'un jour d'extraction : créneaux, sinon Repos/RH/CP. */
function dayScheduleOf(day: ExtractionDay | undefined): DaySchedule {
  if (day && day.status === "work" && day.shifts.length > 0) {
    const label =
      day.shifts.length === 1
        ? `${day.shifts[0].start} – ${day.shifts[0].end}`
        : day.shifts.map((slot) => `${slot.start}–${slot.end}`).join(" · ");
    return { label, isWork: true };
  }
  if (day?.status === "rh") return { label: "RH", isWork: false };
  if (day?.status === "cp") return { label: "CP", isWork: false };
  return { label: "Repos", isWork: false };
}

type TeamScan = {
  id: string;
  employees: ExtractionEmployee[];
  myRow: number | null;
};

export default function EquipeScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const params = useLocalSearchParams<{ ownerId?: string }>();
  const plan = usePlan();
  const isPremium = isPremiumPlan(plan);

  // Uploader dont on affiche l'équipe : passé par l'accueil (mode conjoint
  // inclus) ; repli sur mon propre compte si le param manque.
  const ownerId = params.ownerId || session?.user.id || null;
  const isOwn = !ownerId || ownerId === session?.user.id;
  const monday = mondayOf(new Date());

  const [scan, setScan] = useState<TeamScan | null>(null);
  // Planning suivi + personne suivie non-premium : verrou SANS déblocage
  // (on ne peut pas acheter l'accès aux données de quelqu'un d'autre).
  const [isBlockedByOwnerPlan, setIsBlockedByOwnerPlan] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSharing, setIsSharing] = useState(false);
  // Défaut = aujourd'hui si dans la semaine du planning, sinon lundi.
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const today = new Date().toISOString().slice(0, 10);
    const index = Array.from({ length: 7 }, (_, i) => addDays(mondayOf(new Date()), i)).indexOf(
      today,
    );
    return index === -1 ? 0 : index;
  });
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!ownerId) {
      setScan(null);
      setIsLoading(false);
      return;
    }
    // Profil de l'uploader consulté : alias (ligne de référence) + plan.
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan, employee_aliases, display_name")
      .eq("id", ownerId)
      .single<{ plan: Plan; employee_aliases: string[]; display_name: string }>();
    // Planning suivi : c'est le plan de la personne SUIVIE qui ouvre sa vue
    // équipe (la RLS refuse déjà ses scans aux suiveurs sinon) — inutile de
    // requêter le scan, on affiche le verrou directement.
    if (!isOwn && !isPremiumPlan(profile?.plan ?? "free")) {
      setIsBlockedByOwnerPlan(true);
      setScan(null);
      setIsLoading(false);
      return;
    }
    setIsBlockedByOwnerPlan(false);
    // Dernier scan validé de la semaine courante de cet uploader.
    const { data } = await supabase
      .from("scans")
      .select("id, raw_extraction")
      .eq("uploader_id", ownerId)
      .eq("week_start", monday)
      .eq("status", "validated")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; raw_extraction: PlanningExtraction | null }>();
    const employees = data?.raw_extraction?.employees;
    if (!data || !employees || employees.length === 0) {
      setScan(null);
      setIsLoading(false);
      return;
    }
    // « Moi » = la ligne de l'uploader consulté (mêmes alias que loadTeam).
    const myRow =
      findTargetEmployee(employees, profile?.employee_aliases ?? [], profile?.display_name ?? "")
        ?.row_index ?? null;
    setScan({ id: data.id, employees, myRow });
    setIsLoading(false);
  }, [ownerId, isOwn, monday]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Moi en premier, puis les autres dans l'ordre du planning.
  const employees = useMemo(() => {
    if (!scan) return [];
    if (scan.myRow == null) return scan.employees;
    const mine = scan.employees.filter((e) => e.row_index === scan.myRow);
    const others = scan.employees.filter((e) => e.row_index !== scan.myRow);
    return [...mine, ...others];
  }, [scan]);

  // Pastels des avatars : MOI = accentMuted/accent ; les autres alternent.
  const avatarPairs = [
    { soft: colors.accentMuted, strong: colors.accent },
    { soft: colors.shiftMeetingSoft, strong: colors.shiftMeeting },
    { soft: colors.shiftCpSoft, strong: colors.shiftCp },
  ];

  const selectedDate = addDays(monday, selectedIndex);
  const sectionLabel = `${SECTION_DAY_FORMATTER.format(
    new Date(`${selectedDate}T12:00:00`),
  ).toUpperCase()} ${dayNumber(selectedDate)} — ${employees.length} PERSONNE${
    employees.length > 1 ? "S" : ""
  }`;

  async function handleShareCode() {
    if (!scan) return;
    if (!isPremiumPlan(await fetchPlan())) {
      showPremiumGate("Le partage de planning par code");
      return;
    }
    setIsSharing(true);
    try {
      const code = await createShare(scan.id);
      await Share.share({
        message:
          `Récupère tes horaires sur Clork sans re-scanner le planning ! ` +
          `Ouvre l'app → Ajouter → « J'ai reçu un code » et saisis : ${code.toUpperCase()}`,
      });
    } catch (error) {
      Alert.alert("Partage impossible", error instanceof Error ? error.message : "Erreur inconnue");
    } finally {
      setIsSharing(false);
    }
  }

  const header = (
    <View style={styles.header}>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.navigate("/(tabs)"))}
        hitSlop={12}
        accessibilityLabel="Retour"
        style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <Ionicons name="chevron-back" size={20} color={colors.text} />
      </Pressable>
      <View>
        <Text style={[styles.title, { color: colors.text }]}>L'équipe</Text>
        <Text style={[styles.titleSub, { color: colors.textMuted }]}>
          Semaine du {WEEK_OF_FORMATTER.format(new Date(`${monday}T12:00:00`))}
        </Text>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView edges={["top"]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.content}>{header}</View>
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  // Planning suivi dont le propriétaire n'est pas premium : verrou sobre,
  // volontairement SANS bouton (le déblocage ne dépend pas du lecteur).
  if (isBlockedByOwnerPlan) {
    return (
      <SafeAreaView edges={["top"]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.content}>{header}</View>
        <View style={styles.centerFill}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceMuted }]}>
            <Ionicons name="lock-closed" size={24} color={colors.textMuted} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Réservé à Premium</Text>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            Les horaires de l'équipe sont visibles quand la personne que tu suis a Clork Premium.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Pas de scan validé cette semaine : état vide (ex-InfoSheet de l'accueil).
  // Sur un planning suivi, pas de CTA Scanner : ce serait MON scan, pas le sien.
  if (!scan) {
    return (
      <SafeAreaView edges={["top"]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.content}>{header}</View>
        <View style={styles.centerFill}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.accentMuted }]}>
            <Ionicons name="people-outline" size={26} color={colors.accent} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Pas de planning d'équipe</Text>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            {isOwn
              ? "Aucun scan validé pour cette semaine — scanne le planning pour voir les horaires des collègues."
              : "Aucun scan validé cette semaine sur ce planning suivi."}
          </Text>
          {isOwn ? (
            <Button
              label="Scanner le planning"
              onPress={() => router.navigate("/(tabs)/scan")}
              style={styles.emptyCta}
            />
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {header}

        {/* Bandeau de jours : LUN 27 … DIM 2, sélection encre. */}
        <View style={styles.dayStrip}>
          {DAY_LABELS.map((label, index) => {
            const isSelected = index === selectedIndex;
            return (
              <Pressable
                key={label}
                onPress={() => setSelectedIndex(index)}
                accessibilityLabel={`${label} ${dayNumber(addDays(monday, index))}`}
                style={[
                  styles.dayChip,
                  isSelected
                    ? { backgroundColor: colors.ink, borderColor: colors.ink }
                    : { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <Text
                  style={[
                    styles.dayChipLabel,
                    { color: isSelected ? colors.onInk : colors.textMuted },
                    isSelected && styles.dayChipLabelSelected,
                  ]}
                >
                  {label}
                </Text>
                <Text
                  style={[styles.dayChipNumber, { color: isSelected ? colors.onInk : colors.text }]}
                >
                  {dayNumber(addDays(monday, index))}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{sectionLabel}</Text>

        {/* Une carte par employé du scan, moi en premier. */}
        <View style={styles.cardList}>
          {employees.map((employee, index) => {
            const isMe = scan.myRow != null && employee.row_index === scan.myRow;
            const otherIndex = scan.myRow != null ? index - 1 : index;
            const pair = isMe ? avatarPairs[0] : avatarPairs[Math.max(otherIndex, 0) % 3];

            // Verrou non-premium (MA vue seulement — sur un planning suivi le
            // verrou dépend du plan du suivi, traité plus haut) : silhouettes.
            if (isOwn && !isPremium && !isMe) {
              return (
                <View
                  key={employee.row_index}
                  style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <View style={styles.cardHeader}>
                    <View style={[styles.avatar, { backgroundColor: pair.soft }]} />
                    <View style={styles.ghostBars}>
                      <View
                        style={[
                          styles.ghostBar,
                          styles.ghostBarLong,
                          { backgroundColor: colors.surfaceMuted },
                        ]}
                      />
                      <View
                        style={[
                          styles.ghostBar,
                          styles.ghostBarShort,
                          { backgroundColor: colors.surfaceMuted },
                        ]}
                      />
                    </View>
                    <View style={[styles.ghostChip, { backgroundColor: colors.surfaceMuted }]} />
                  </View>
                </View>
              );
            }

            const schedule = dayScheduleOf(
              employee.days.find((d) => d.day_index === selectedIndex),
            );
            const isOpen = expandedRow === employee.row_index;
            return (
              <Pressable
                key={employee.row_index}
                onPress={() => setExpandedRow(isOpen ? null : employee.row_index)}
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.surface,
                    borderColor: isMe ? colors.accent : colors.border,
                  },
                ]}
              >
                <View style={styles.cardHeader}>
                  <View style={[styles.avatar, { backgroundColor: pair.soft }]}>
                    <Text style={[styles.avatarLetter, { color: pair.strong }]}>
                      {employee.name.trim().charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.cardText}>
                    <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>
                      {employee.name}
                      {/* « (toi) » n'a de sens que sur MON planning. */}
                      {isMe && isOwn ? (
                        <Text style={{ color: colors.textMuted }}> (toi)</Text>
                      ) : null}
                    </Text>
                    <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
                      {employee.total_hours != null
                        ? `${employee.total_hours}h cette semaine`
                        : "—"}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.chip,
                      {
                        backgroundColor: schedule.isWork ? colors.accentMuted : colors.background,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: schedule.isWork ? colors.accent : colors.textMuted },
                      ]}
                    >
                      {schedule.label}
                    </Text>
                  </View>
                  <Ionicons
                    name={isOpen ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={colors.textMuted}
                  />
                </View>

                {/* Semaine complète dépliée dans la carte. */}
                {isOpen ? (
                  <View style={[styles.weekDetail, { borderTopColor: colors.separator }]}>
                    {Array.from({ length: 7 }, (_, dayIndex) => {
                      const daySchedule = dayScheduleOf(
                        employee.days.find((d) => d.day_index === dayIndex),
                      );
                      const isSelectedDay = dayIndex === selectedIndex;
                      return (
                        <View
                          key={dayIndex}
                          style={[
                            styles.weekRow,
                            isSelectedDay && { backgroundColor: colors.accentMuted },
                          ]}
                        >
                          <Text style={[styles.weekRowDay, { color: colors.textMuted }]}>
                            {DAY_ROW_LABELS[dayIndex]} {dayNumber(addDays(monday, dayIndex))}
                          </Text>
                          <Text
                            style={[
                              styles.weekRowTime,
                              { color: daySchedule.isWork ? colors.text : colors.textMuted },
                            ]}
                          >
                            {daySchedule.label}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {/* Bandeau verrou Premium (repris de la feuille équipe v1). */}
        {isOwn && !isPremium ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => showPremiumGate("Les horaires de tes collègues")}
            style={[styles.premiumBanner, { backgroundColor: colors.surfaceMuted }]}
          >
            <Text style={[styles.premiumBannerText, { color: colors.textSoft }]}>
              Les horaires de tes collègues sont réservés à Premium
            </Text>
            <Text style={[styles.premiumBannerCta, { color: colors.accent }]}>Débloquer ›</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {/* CTA épinglé sous la liste : partage du code équipe — seulement sur
          MON planning (sur un suivi, le code appartient à la personne suivie). */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {isOwn ? (
          <Button
            label="Envoyer le code à l'équipe"
            onPress={handleShareCode}
            isLoading={isSharing}
          />
        ) : null}
        <Text style={[styles.footerNote, { color: colors.textDisabled }]}>
          Issu du dernier scan validé de la semaine
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: radius.input,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: typeScale.title - 4,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.title,
  },
  titleSub: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
  },
  centerFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.sm + 2,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    fontSize: typeScale.heading,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.heading,
  },
  emptyText: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
    textAlign: "center",
    lineHeight: 19,
  },
  emptyCta: {
    alignSelf: "stretch",
    marginTop: spacing.sm,
  },
  dayStrip: {
    flexDirection: "row",
    gap: 6,
  },
  dayChip: {
    flex: 1,
    alignItems: "center",
    gap: 1,
    borderRadius: radius.input,
    borderWidth: 1,
    paddingVertical: 8,
  },
  dayChipLabel: {
    fontSize: 10,
    fontFamily: fonts.semiBold,
    letterSpacing: 0.3,
  },
  dayChipLabelSelected: {
    opacity: 0.7,
  },
  dayChipNumber: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.bold,
  },
  sectionLabel: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  cardList: {
    gap: spacing.sm,
  },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    fontSize: typeScale.body,
    fontFamily: fonts.bold,
  },
  cardText: {
    flex: 1,
    gap: 1,
  },
  cardName: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.bold,
  },
  cardMeta: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
  },
  chip: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: {
    fontSize: typeScale.caption,
    fontFamily: fonts.bold,
  },
  weekDetail: {
    borderTopWidth: 1,
    paddingTop: 8,
    gap: 2,
  },
  weekRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  weekRowDay: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
  },
  weekRowTime: {
    fontSize: typeScale.caption,
    fontFamily: fonts.bold,
  },
  // Silhouette (verrou Premium) : pastille pastel + 2 barres + chip fantôme.
  ghostBars: {
    flex: 1,
    gap: 6,
  },
  ghostBar: {
    borderRadius: 4,
  },
  ghostBarLong: {
    height: 12,
    width: "60%",
  },
  ghostBarShort: {
    height: 10,
    width: "35%",
  },
  ghostChip: {
    width: 72,
    height: 24,
    borderRadius: 8,
  },
  premiumBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    borderRadius: radius.input,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  premiumBannerText: {
    flex: 1,
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
  },
  premiumBannerCta: {
    fontSize: typeScale.caption,
    fontFamily: fonts.bold,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm + 2,
    gap: spacing.sm + 2,
  },
  footerNote: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
    textAlign: "center",
  },
});
