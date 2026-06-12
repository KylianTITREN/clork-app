// Export des créneaux vers le calendrier natif du téléphone (expo-calendar).
// Un calendrier dédié « Clork » est créé au premier export ; la synchro vers
// Google/Apple/Outlook est ensuite assurée par les comptes du téléphone.
// Ré-exporter une semaine remplace ses événements (pas de doublons).

import * as Calendar from "expo-calendar";
import { Platform } from "react-native";

import { shiftTypeLabel } from "@/constants/tokens";
import { addDays } from "@/lib/dates";
import type { Shift } from "@/lib/types";

const CALENDAR_TITLE = "Clork";
const CALENDAR_COLOR = "#FFC233";

export async function ensurePermission(): Promise<boolean> {
  const { granted } = await Calendar.requestCalendarPermissionsAsync();
  return granted;
}

async function getOrCreateClorkCalendar(): Promise<string> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const existing = calendars.find((c) => c.title === CALENDAR_TITLE && c.allowsModifications);
  if (existing) return existing.id;

  if (Platform.OS === "ios") {
    const defaultCalendar = await Calendar.getDefaultCalendarAsync();
    return Calendar.createCalendarAsync({
      title: CALENDAR_TITLE,
      color: CALENDAR_COLOR,
      entityType: Calendar.EntityTypes.EVENT,
      sourceId: defaultCalendar.source.id,
      name: CALENDAR_TITLE,
      ownerAccount: "personal",
      accessLevel: Calendar.CalendarAccessLevel.OWNER,
    });
  }
  return Calendar.createCalendarAsync({
    title: CALENDAR_TITLE,
    color: CALENDAR_COLOR,
    entityType: Calendar.EntityTypes.EVENT,
    source: { isLocalAccount: true, name: CALENDAR_TITLE, type: Calendar.SourceType.LOCAL },
    name: CALENDAR_TITLE,
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

/**
 * Exporte les créneaux d'une semaine (lundi → dimanche) : purge les anciens
 * événements Clork de la période puis recrée tout. Retourne le nombre exporté.
 */
export async function exportWeek(monday: string, shifts: Shift[]): Promise<number> {
  const calendarId = await getOrCreateClorkCalendar();

  const rangeStart = new Date(`${monday}T00:00:00`);
  const rangeEnd = new Date(`${addDays(monday, 7)}T00:00:00`);
  const previous = await Calendar.getEventsAsync([calendarId], rangeStart, rangeEnd);
  await Promise.all(previous.map((event) => Calendar.deleteEventAsync(event.id)));

  let count = 0;
  for (const shift of shifts) {
    if (shift.start_at && shift.end_at) {
      const notes = [
        shift.break_minutes > 0 ? `Pause : ${formatBreak(shift.break_minutes)}` : null,
        shift.note,
        "Ajouté par Clork",
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
    } else if (shift.type === "rh" || shift.type === "cp" || shift.type === "leave") {
      await Calendar.createEventAsync(calendarId, {
        title: eventTitle(shift),
        startDate: new Date(`${shift.date}T00:00:00`),
        endDate: new Date(`${addDays(shift.date, 1)}T00:00:00`),
        allDay: true,
        notes: [shift.note, "Ajouté par Clork"].filter(Boolean).join("\n"),
      });
      count += 1;
    }
  }
  return count;
}
