import { ru } from '@/i18n/ru';
import { DAY_MS, HOUR_MS, MINUTE_MS, startOfStudyDay, studyDaysBetween } from './dates';
import type { SchedulePreview } from './srs';

/** Label under a grade button: "10 мин", "1 д", "4 д", "2 мес". */
export function formatPreview(p: SchedulePreview): string {
  if (p.state === 'review') return formatDays(p.intervalDays);
  return formatDuration(p.delayMs);
}

export function formatDays(days: number): string {
  if (days < 30) return ru.intervals.day(days);
  if (days < 365) return ru.intervals.month(Math.round((days / 30) * 10) / 10);
  return ru.intervals.year(Math.round((days / 365) * 10) / 10);
}

export function formatDuration(ms: number): string {
  const v = Math.max(0, ms);
  if (v < HOUR_MS) return ru.intervals.min(Math.max(1, Math.round(v / MINUTE_MS)));
  if (v < DAY_MS) return ru.intervals.hour(Math.round(v / HOUR_MS));
  return ru.intervals.day(Math.round(v / DAY_MS));
}

/** "12 окт" or "12 окт 2025" when not in the current year. */
export function formatDate(iso: string | Date, now = new Date()): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  const base = `${d.getDate()} ${ru.months[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

export function formatDateTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${formatDate(d, now)}, ${hh}:${mm}`;
}

/** Relative due label by study day: "сейчас", "сегодня", "завтра", "через 5 д", or a date. */
export function formatDue(iso: string, now: Date, dayStartsAtHour: number): string {
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return '—';
  if (due.getTime() <= now.getTime()) return ru.word.dueNow;
  const days = studyDaysBetween(startOfStudyDay(now, dayStartsAtHour), startOfStudyDay(due, dayStartsAtHour));
  if (days <= 0) return `сегодня, ${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}`;
  if (days === 1) return 'завтра';
  if (days < 30) return `через ${ru.intervals.day(days)}`;
  return formatDate(due, now);
}
