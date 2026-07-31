// Infos du magasin (Clork Pro) : notes déposées par la responsable en même
// temps que le planning — « Livraison mardi 7h », « Ménage vitrines jeudi ».
// Ce sont des informations SECONDAIRES : elles se posent sous l'horaire du
// jour, en gris, sans jamais lui prendre la vedette.
//
// Portée : la RLS de `store_notices` ne laisse remonter que les infos du
// magasin dont je suis membre CONFIRMÉ — donc MON magasin. L'accueil ne les
// charge pas quand il affiche le planning d'une personne suivie.

import { StyleSheet, Text, View } from "react-native";

import { fonts, radius, spacing, typeScale, useThemeColors } from "@/constants/tokens";
import { supabase } from "@/lib/supabase";

/** Une info du magasin. `date` à null = valable toute la semaine. */
export type StoreNotice = {
  date: string | null;
  title: string;
  detail: string | null;
};

// Vue Aujourd'hui : deux lignes au maximum, le reste est compté.
const TODAY_VISIBLE = 2;
// Emplacements dédiés (jour déplié, encart de semaine) : un peu plus généreux.
const EXPANDED_VISIBLE = 4;

/**
 * Infos de la semaine affichée, pour MON magasin.
 * Une seule requête : le tri et le filtrage par jour se font ensuite en mémoire.
 * Un backend sans la table (migration pas encore passée) ne doit pas casser
 * l'accueil — on retombe silencieusement sur « aucune info ».
 */
export async function fetchStoreNotices(weekStart: string): Promise<StoreNotice[]> {
  try {
    const { data, error } = await supabase
      .from("store_notices")
      .select("date, title, detail")
      .eq("week_start", weekStart)
      .order("date", { nullsFirst: true });
    if (error || !data) return [];
    return (data as StoreNotice[]).filter((notice) => !!notice.title?.trim());
  } catch {
    // Ne JAMAIS faire échouer le chargement de la semaine pour une info
    // secondaire : l'accueil doit afficher les horaires quoi qu'il arrive.
    return [];
  }
}

/** Infos datées d'un jour donné (`YYYY-MM-DD`). */
export function noticesForDate(notices: StoreNotice[], date: string): StoreNotice[] {
  return notices.filter((notice) => notice.date?.slice(0, 10) === date);
}

/** Infos sans date : valables toute la semaine. */
export function weekWideNotices(notices: StoreNotice[]): StoreNotice[] {
  return notices.filter((notice) => !notice.date);
}

function noticeKey(notice: StoreNotice, index: number): string {
  return `${notice.date ?? "week"}-${index}-${notice.title}`;
}

type StoreNoticeListProps = {
  notices: StoreNotice[];
  /** Lignes affichées avant le repli « +N autre(s) ». */
  max?: number;
};

/** Lignes discrètes : pastille accent, titre, détail en plus petit. */
export function StoreNoticeList({ notices, max = TODAY_VISIBLE }: StoreNoticeListProps) {
  const colors = useThemeColors();
  if (notices.length === 0) return null;
  const visible = notices.slice(0, max);
  const hidden = notices.length - visible.length;
  return (
    <View style={styles.list}>
      {visible.map((notice, index) => (
        <View key={noticeKey(notice, index)} style={styles.row}>
          <View style={[styles.dot, { backgroundColor: colors.accent }]} />
          <View style={styles.rowText}>
            <Text style={[styles.title, { color: colors.textSoft }]}>{notice.title}</Text>
            {notice.detail ? (
              <Text style={[styles.detail, { color: colors.textMuted }]}>{notice.detail}</Text>
            ) : null}
          </View>
        </View>
      ))}
      {hidden > 0 ? (
        <Text style={[styles.more, { color: colors.textMuted }]}>
          +{hidden} autre{hidden > 1 ? "s" : ""} info{hidden > 1 ? "s" : ""}
        </Text>
      ) : null}
    </View>
  );
}

/** Encart unique en haut de la vue semaine : les infos sans date. */
export function StoreWeekNotices({ notices }: { notices: StoreNotice[] }) {
  const colors = useThemeColors();
  if (notices.length === 0) return null;
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.kicker, { color: colors.accent }]}>TOUTE LA SEMAINE</Text>
      <StoreNoticeList notices={notices} max={EXPANDED_VISIBLE} />
    </View>
  );
}

/** Infos d'un jour, sous les créneaux du jour déplié. */
export function StoreDayNotices({ notices }: { notices: StoreNotice[] }) {
  return <StoreNoticeList notices={notices} max={EXPANDED_VISIBLE} />;
}

const styles = StyleSheet.create({
  list: {
    gap: 7,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },
  // Pastille calée sur la première ligne de texte, pas sur le bloc.
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
  },
  detail: {
    fontSize: typeScale.caption,
    fontFamily: fonts.regular,
    lineHeight: 17,
  },
  more: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
    marginLeft: 15,
  },
  card: {
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: spacing.sm,
  },
  kicker: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
    letterSpacing: 0.4,
  },
});
