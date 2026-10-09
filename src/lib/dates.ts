/**
 * Study-day arithmetic in the device's local time zone.
 *
 * A "study day" starts at `dayStartsAtHour` local time (default 04:00), so a
 * review at 01:30 still belongs to the previous day. All functions are pure and
 * take `now` explicitly. Day arithmetic goes through the local Date constructor
 * (y, m, d + n, h), which handles DST transitions correctly.
 */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

function clampHour(hour: number): number {
  if (!Number.isFinite(hour)) return 0;
  return Math.min(23, Math.max(0, Math.trunc(hour)));
}

/** Local start of the study day that contains `now`. */
export function startOfStudyDay(now: Date, dayStartsAtHour: number): Date {
  const h = clampHour(dayStartsAtHour);
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  let start = new Date(y, m, d, h, 0, 0, 0);
  if (now.getTime() < start.getTime()) {
    start = new Date(y, m, d - 1, h, 0, 0, 0);
  }
  return start;
}

/** Start of the study day `n` days after the study day that starts at `dayStart`. */
export function addStudyDays(dayStart: Date, n: number, dayStartsAtHour: number): Date {
  const h = clampHour(dayStartsAtHour);
  return new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + n, h, 0, 0, 0);
}

/** Exclusive end of the current study day (= start of the next one). */
export function endOfStudyDay(now: Date, dayStartsAtHour: number): Date {
  return addStudyDays(startOfStudyDay(now, dayStartsAtHour), 1, dayStartsAtHour);
}

/** `YYYY-MM-DD` of the calendar date on which the study day containing `date` starts. */
export function studyDayKey(date: Date, dayStartsAtHour: number): string {
  return localDateKey(startOfStudyDay(date, dayStartsAtHour));
}

/** `YYYY-MM-DD` of a local calendar date. */
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parses a `YYYY-MM-DD` key into local midnight of that date. */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Whole calendar days between two study-day starts (DST-safe). */
export function studyDaysBetween(fromDayStart: Date, toDayStart: Date): number {
  const a = Date.UTC(fromDayStart.getFullYear(), fromDayStart.getMonth(), fromDayStart.getDate());
  const b = Date.UTC(toDayStart.getFullYear(), toDayStart.getMonth(), toDayStart.getDate());
  return Math.round((b - a) / DAY_MS);
}

/** True when `dueAt` falls before the end of the current study day. */
export function isDueToday(dueAt: string | Date, now: Date, dayStartsAtHour: number): boolean {
  const due = typeof dueAt === 'string' ? Date.parse(dueAt) : dueAt.getTime();
  if (Number.isNaN(due)) return true;
  return due < endOfStudyDay(now, dayStartsAtHour).getTime();
}

/** `YYYY-MM-DD` for a file name, in local time. */
export function fileDateStamp(now: Date): string {
  return localDateKey(now);
}

/** Monday-based weekday index 0..6. */
export function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}
