// Helpers de dates (tout en "YYYY-MM-DD" local, sans dépendance).

export function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

/** Lundi de la semaine contenant la date donnée. */
export function mondayOf(date: Date): string {
  const d = new Date(date);
  const day = d.getDay(); // 0 = dimanche
  d.setDate(d.getDate() - ((day + 6) % 7));
  return isoDate(d);
}

export const WEEK_LABEL_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
});

export function weekLabel(monday: string): string {
  return `${WEEK_LABEL_FORMATTER.format(new Date(`${monday}T12:00:00`))} – ${WEEK_LABEL_FORMATTER.format(new Date(`${addDays(monday, 6)}T12:00:00`))}`;
}

/** "12:30" + 60 min → "13:30". Tolère "HH:MM:SS" en entrée. */
export function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = (h * 60 + m + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Normalise "HH:MM:SS" → "HH:MM" (colonne Postgres time). */
export function toShortTime(time: string | null): string | null {
  return time ? time.slice(0, 5) : null;
}
