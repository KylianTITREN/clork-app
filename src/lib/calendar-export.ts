// Export des créneaux vers le calendrier natif du téléphone (expo-calendar).
// Un calendrier dédié « Clork » est créé au premier export ; la synchro vers
// Google/Apple/Outlook est ensuite assurée par les comptes du téléphone.
// Ré-exporter une semaine remplace ses événements (pas de doublons).

// Entrée /legacy obligatoire depuis SDK 56 : les mêmes fonctions importées
// depuis "expo-calendar" sont des stubs dépréciés qui throwent à l'exécution.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Calendar from "expo-calendar/legacy";
import { Platform } from "react-native";

import { shiftTypeLabel } from "@/constants/tokens";
import { addDays, addMinutesToTime, toShortTime } from "@/lib/dates";
import type { Shift } from "@/lib/types";

const CALENDAR_TITLE = "Clork";
const CALENDAR_COLOR = "#FFC233";
const PREF_KEY = "clork.exportCalendar";

export async function ensurePermission(): Promise<boolean> {
  const { granted } = await Calendar.requestCalendarPermissionsAsync();
  return granted;
}

// Préférence d'export : calendrier dédié (nom au choix) ou calendrier existant.
export type ExportTarget =
  | { mode: "dedicated"; name: string }
  | { mode: "existing"; calendarId: string; title: string };

const DEFAULT_TARGET: ExportTarget = { mode: "dedicated", name: CALENDAR_TITLE };

export async function loadExportTarget(): Promise<ExportTarget> {
  try {
    const raw = await AsyncStorage.getItem(PREF_KEY);
    return raw ? (JSON.parse(raw) as ExportTarget) : DEFAULT_TARGET;
  } catch {
    return DEFAULT_TARGET;
  }
}

export async function saveExportTarget(target: ExportTarget): Promise<void> {
  await AsyncStorage.setItem(PREF_KEY, JSON.stringify(target));
}

export type WritableCalendar = { id: string; title: string; sourceName: string };

/** Calendriers modifiables du téléphone (pour le choix dans Profil). */
export async function listWritableCalendars(): Promise<WritableCalendar[]> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  return calendars
    .filter((calendar) => calendar.allowsModifications)
    .map((calendar) => ({
      id: calendar.id,
      title: calendar.title,
      sourceName: calendar.source?.name ?? "",
    }));
}

async function getOrCreateClorkCalendar(title: string): Promise<string> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const existing = calendars.find((c) => c.title === title && c.allowsModifications);
  if (existing) return existing.id;

  if (Platform.OS === "ios") {
    // Source du calendrier : défaut → iCloud (CalDAV) → locale. Le défaut peut
    // être indisponible (pas de calendrier par défaut configuré sur l'appareil).
    let sourceId: string | undefined;
    try {
      sourceId = (await Calendar.getDefaultCalendarAsync()).source.id;
    } catch {
      const sources = await Calendar.getSourcesAsync();
      const icloud = sources.find((s) => s.type === Calendar.SourceType.CALDAV);
      const local = sources.find((s) => s.type === Calendar.SourceType.LOCAL);
      sourceId = (icloud ?? local ?? sources[0])?.id;
    }
    if (!sourceId) {
      throw new Error(
        "Aucune source de calendrier disponible — active iCloud Calendrier ou un compte calendrier dans Réglages.",
      );
    }
    return Calendar.createCalendarAsync({
      title,
      color: CALENDAR_COLOR,
      entityType: Calendar.EntityTypes.EVENT,
      sourceId,
      name: title,
      ownerAccount: "personal",
      accessLevel: Calendar.CalendarAccessLevel.OWNER,
    });
  }
  return Calendar.createCalendarAsync({
    title,
    color: CALENDAR_COLOR,
    entityType: Calendar.EntityTypes.EVENT,
    source: { isLocalAccount: true, name: title, type: Calendar.SourceType.LOCAL },
    name: title,
    ownerAccount: "personal",
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });
}

function eventTitle(shift: Shift): string {
  if (shift.type === "work") return "Travail 💼";
  if (shift.type === "meeting") return shift.note ?? "Réunion";
  return shiftTypeLabel[shift.type];
}

function formatBreak(minutes: number): string {
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h${minutes % 60 ? String(minutes % 60).padStart(2, "0") : ""}`
    : `${minutes} min`;
}

const CLORK_MARKER = "Ajouté par Clork";

/**
 * Exporte les créneaux d'une semaine (lundi → dimanche) : purge les anciens
 * événements Clork de la période puis recrée tout. Retourne le nombre exporté.
 * Si la création du calendrier « Clork » est refusée par l'OS (source iCloud
 * indisponible, compte par défaut restreint…), repli sur le calendrier par
 * défaut du téléphone — seuls les événements marqués Clork y sont purgés.
 */
export async function exportWeek(monday: string, shifts: Shift[]): Promise<number> {
  const target = await loadExportTarget();
  let calendarId: string;
  if (target.mode === "existing") {
    // Le calendrier choisi peut avoir été supprimé depuis : on vérifie.
    const writable = await listWritableCalendars();
    const found = writable.find((calendar) => calendar.id === target.calendarId);
    if (!found) {
      throw new Error(
        `Le calendrier « ${target.title} » n'existe plus — choisis-en un autre dans Profil → Mon planning.`,
      );
    }
    calendarId = found.id;
    return writeWeek(calendarId, monday, shifts);
  }
  try {
    calendarId = await getOrCreateClorkCalendar(target.name || CALENDAR_TITLE);
  } catch (creationError) {
    const fallback = await Calendar.getDefaultCalendarAsync().catch(() => null);
    if (!fallback?.allowsModifications) {
      throw new Error(
        "Impossible de créer le calendrier « Clork » et aucun calendrier par défaut modifiable. " +
          (creationError instanceof Error ? creationError.message : ""),
      );
    }
    calendarId = fallback.id;
  }
  return writeWeek(calendarId, monday, shifts);
}

async function writeWeek(calendarId: string, monday: string, shifts: Shift[]): Promise<number> {
  const rangeStart = new Date(`${monday}T00:00:00`);
  const rangeEnd = new Date(`${addDays(monday, 7)}T00:00:00`);
  const previous = await Calendar.getEventsAsync([calendarId], rangeStart, rangeEnd);
  // Marqueur obligatoire : en repli sur le calendrier par défaut, on ne doit
  // JAMAIS supprimer les événements personnels de l'utilisateur.
  const ours = previous.filter((event) => event.notes?.includes(CLORK_MARKER));
  await Promise.all(ours.map((event) => Calendar.deleteEventAsync(event.id)));

  let count = 0;
  for (const shift of shifts) {
    if (shift.start_at && shift.end_at) {
      const notes = [
        shift.break_minutes > 0
          ? `Pause : ${formatBreak(shift.break_minutes)}` +
            (shift.break_start
              ? ` (${toShortTime(shift.break_start)} → ${addMinutesToTime(shift.break_start, shift.break_minutes)})`
              : "")
          : null,
        shift.note,
        CLORK_MARKER,
      ]
        .filter(Boolean)
        .join("\n");
      await Calendar.createEventAsync(calendarId, {
        title: eventTitle(shift),
        startDate: new Date(shift.start_at),
        endDate: new Date(shift.end_at),
        notes,
      });
      count += 1;
    } else if (
      ["rh", "cp", "leave", "rtt", "sick", "absent", "unpaid"].includes(shift.type)
    ) {
      await Calendar.createEventAsync(calendarId, {
        title: eventTitle(shift),
        startDate: new Date(`${shift.date}T00:00:00`),
        endDate: new Date(`${addDays(shift.date, 1)}T00:00:00`),
        allDay: true,
        notes: [shift.note, CLORK_MARKER].filter(Boolean).join("\n"),
      });
      count += 1;
    }
  }
  return count;
}
