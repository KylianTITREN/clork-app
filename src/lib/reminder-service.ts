// Rappels LOCAUX via expo-notifications (trigger date) — aucun push token
// requis, donc aucun compte Apple payant. Le push distant reste gaté par
// extra.pushEnabled (voir notifications.ts) et n'est pas concerné ici.
//
// Stratégie : à chaque changement de préférences OU rechargement du planning,
// on annule TOUT puis on replanifie sur 7 jours glissants. Idempotent et
// simple — pas d'état à réconcilier.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

import { addDays, isoDate, toShortTime } from "@/lib/dates";
import type { Shift } from "@/lib/types";

const STORAGE_KEY = "clork.reminders";
const ROLLING_DAYS = 7;
const SCAN_REMINDER_TIME = "18:00";

export type ReminderPrefs = {
  /** Rappel la veille au soir si des créneaux existent demain. */
  eveEnabled: boolean;
  eveTime: string; // "19:00"
  /** Rappel le matin même. */
  morningEnabled: boolean;
  morningTime: string; // "07:30"
  /** Rappel hebdomadaire « scanne le planning de la semaine prochaine ». */
  scanEnabled: boolean;
  /** Jour du rappel scan : 1 = lundi … 7 = dimanche. */
  scanWeekday: number;
};

export const DEFAULT_REMINDER_PREFS: ReminderPrefs = {
  eveEnabled: false,
  eveTime: "19:00",
  morningEnabled: false,
  morningTime: "07:30",
  scanEnabled: false,
  scanWeekday: 4, // jeudi
};

/** Sous-ensemble de Shift suffisant pour planifier les rappels. */
export type ReminderShift = Pick<Shift, "date" | "start_at" | "end_at" | "break_minutes">;

// Handler foreground : on affiche l'alerte même app ouverte (rappels locaux).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Lit les préférences persistées (défauts si absentes ou illisibles). */
export async function getReminderPrefs(): Promise<ReminderPrefs> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_REMINDER_PREFS;
    return { ...DEFAULT_REMINDER_PREFS, ...(JSON.parse(raw) as Partial<ReminderPrefs>) };
  } catch {
    return DEFAULT_REMINDER_PREFS;
  }
}

/** Persiste les préférences (best effort, jamais bloquant). */
export async function saveReminderPrefs(prefs: ReminderPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Persistance impossible : les rappels restent planifiés pour la session.
  }
}

/**
 * Demande la permission notifications (à appeler au premier toggle ON).
 * Retourne true si accordée — silencieux si refusée.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

/** "HH:MM" + date ISO locale → Date locale. */
function atTime(dateIso: string, time: string): Date {
  return new Date(`${dateIso}T${time}:00`);
}

/** 90 → "1h30 de pause", 45 → "45 min de pause", 0 → null. */
function formatBreak(minutes: number): string | null {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min de pause`;
  if (m === 0) return `${h}h de pause`;
  return `${h}h${String(m).padStart(2, "0")} de pause`;
}

/** Résumé d'une journée : "09:00–17:00 (1h de pause)", null si rien de travaillé. */
function dayLine(shifts: ReminderShift[]): string | null {
  const worked = shifts.filter((s) => s.start_at && s.end_at);
  if (worked.length === 0) return null;
  const slots = worked
    .map((s) => `${toShortTime(s.start_at)}–${toShortTime(s.end_at)}`)
    .join(" / ");
  const totalBreak = worked.reduce((sum, s) => sum + (s.break_minutes ?? 0), 0);
  const breakLabel = formatBreak(totalBreak);
  return breakLabel ? `${slots} (${breakLabel})` : slots;
}

/** Jour de semaine local 1 = lundi … 7 = dimanche. */
function weekdayOf(dateIso: string): number {
  return ((new Date(`${dateIso}T12:00:00`).getDay() + 6) % 7) + 1;
}

async function scheduleAt(title: string, body: string, date: Date): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
  });
}

/**
 * Annule tous les rappels planifiés puis replanifie sur 7 jours glissants
 * d'après les préférences et les créneaux fournis. Silencieux si la
 * permission n'est pas accordée (rien n'est planifié).
 */
export async function applyReminderPrefs(
  prefs: ReminderPrefs,
  shifts: ReminderShift[],
): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!prefs.eveEnabled && !prefs.morningEnabled && !prefs.scanEnabled) return;

    const { granted } = await Notifications.getPermissionsAsync();
    if (!granted) return;

    const now = new Date();
    const todayIso = isoDate(now);

    const byDate = new Map<string, ReminderShift[]>();
    for (const shift of shifts) {
      const list = byDate.get(shift.date);
      if (list) list.push(shift);
      else byDate.set(shift.date, [shift]);
    }

    for (let offset = 0; offset < ROLLING_DAYS; offset += 1) {
      const dateIso = addDays(todayIso, offset);
      const line = dayLine(byDate.get(dateIso) ?? []);
      if (!line) continue;

      if (prefs.eveEnabled) {
        const trigger = atTime(addDays(dateIso, -1), prefs.eveTime);
        if (trigger > now) {
          await scheduleAt("Demain au travail 💼", `Demain : ${line}`, trigger);
        }
      }
      if (prefs.morningEnabled) {
        const trigger = atTime(dateIso, prefs.morningTime);
        if (trigger > now) {
          await scheduleAt("Aujourd'hui au travail ☀️", `Aujourd'hui : ${line}`, trigger);
        }
      }
    }

    if (prefs.scanEnabled) {
      for (let offset = 0; offset < ROLLING_DAYS; offset += 1) {
        const dateIso = addDays(todayIso, offset);
        if (weekdayOf(dateIso) !== prefs.scanWeekday) continue;
        const trigger = atTime(dateIso, SCAN_REMINDER_TIME);
        if (trigger > now) {
          await scheduleAt(
            "Planning de la semaine prochaine",
            "Pense à scanner le planning de la semaine prochaine 📸",
            trigger,
          );
          break;
        }
      }
    }
  } catch {
    // Les rappels sont un confort, jamais bloquants.
  }
}

/**
 * Lit les préférences persistées puis replanifie d'après les créneaux fournis.
 * À appeler depuis l'onglet Planning après chargement des shifts.
 */
export async function rescheduleFromShifts(shifts: ReminderShift[]): Promise<void> {
  const prefs = await getReminderPrefs();
  await applyReminderPrefs(prefs, shifts);
}
