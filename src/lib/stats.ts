/**
 * Pure statistics over review logs and cards.
 */
import type { ReviewCard, ReviewLog, Word } from '@/db/types';
import { addStudyDays, localDateKey, mondayIndex, parseDateKey, startOfStudyDay, studyDayKey } from './dates';
import { cardsByWord, computeWordStats, type WordStatus } from './wordStatus';

/** Distinct words reviewed in the current study day. */
export function wordsReviewedToday(
  logs: readonly Pick<ReviewLog, 'wordId' | 'reviewedAt'>[],
  now: Date,
  dayStartsAtHour: number,
): number {
  const start = startOfStudyDay(now, dayStartsAtHour).toISOString();
  const ids = new Set<string>();
  for (const l of logs) if (l.reviewedAt >= start) ids.add(l.wordId);
  return ids.size;
}

/** Study-day keys (YYYY-MM-DD) that have at least one review. */
export function activeDayKeys(reviewedAts: readonly string[], dayStartsAtHour: number): Set<string> {
  const keys = new Set<string>();
  for (const iso of reviewedAts) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) keys.add(studyDayKey(d, dayStartsAtHour));
  }
  return keys;
}

/**
 * Consecutive study days with at least one review, ending today — or yesterday
 * when nothing has been reviewed yet today (the streak is not broken until the day ends).
 */
export function computeStreak(dayKeys: ReadonlySet<string>, now: Date, dayStartsAtHour: number): number {
  const today = startOfStudyDay(now, dayStartsAtHour);
  let cursor = dayKeys.has(localDateKey(today)) ? today : addStudyDays(today, -1, dayStartsAtHour);
  let n = 0;
  while (dayKeys.has(localDateKey(cursor))) {
    n++;
    cursor = addStudyDays(cursor, -1, dayStartsAtHour);
  }
  return n;
}

export interface Accuracy {
  correct: number;
  total: number;
  /** 0..1 or null when there are no answers. */
  ratio: number | null;
}

export function accuracySince(logs: readonly Pick<ReviewLog, 'wasCorrect' | 'reviewedAt'>[], since: Date): Accuracy {
  const iso = since.toISOString();
  let correct = 0;
  let total = 0;
  for (const l of logs) {
    if (l.reviewedAt < iso) continue;
    total++;
    if (l.wasCorrect) correct++;
  }
  return { correct, total, ratio: total ? correct / total : null };
}

export interface HeatCell {
  key: string;
  date: Date;
  count: number;
  isToday: boolean;
  isFuture: boolean;
}

/** GitHub-style grid: `weeks` columns × 7 rows (Mon..Sun), ending with the current week. */
export function heatmap(reviewedAts: readonly string[], now: Date, dayStartsAtHour: number, weeks = 16): HeatCell[][] {
  const counts = new Map<string, number>();
  for (const iso of reviewedAts) {
    const key = studyDayKey(new Date(iso), dayStartsAtHour);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const todayKey = studyDayKey(now, dayStartsAtHour);
  const today = parseDateKey(todayKey);
  const firstMonday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - mondayIndex(today) - (weeks - 1) * 7);
  const cols: HeatCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(firstMonday.getFullYear(), firstMonday.getMonth(), firstMonday.getDate() + w * 7 + d);
      const key = localDateKey(date);
      col.push({ key, date, count: counts.get(key) ?? 0, isToday: key === todayKey, isFuture: key > todayKey });
    }
    cols.push(col);
  }
  return cols;
}

/** 0..4 intensity level for a heatmap cell. */
export function heatLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count < 5) return 1;
  if (count < 15) return 2;
  if (count < 30) return 3;
  return 4;
}

/** Cards due per study day for the next `days` days (index 0 = today, incl. overdue). */
export function forecast(
  cards: readonly Pick<ReviewCard, 'state' | 'dueAt' | 'wordId'>[],
  now: Date,
  dayStartsAtHour: number,
  days = 7,
  archivedWordIds: ReadonlySet<string> = new Set(),
): number[] {
  const out = new Array<number>(days).fill(0);
  const start = startOfStudyDay(now, dayStartsAtHour);
  const bounds: number[] = [];
  for (let i = 1; i <= days; i++) bounds.push(addStudyDays(start, i, dayStartsAtHour).getTime());
  for (const c of cards) {
    if (c.state === 'new' || archivedWordIds.has(c.wordId)) continue;
    const t = Date.parse(c.dueAt);
    const idx = bounds.findIndex((b) => t < b);
    if (idx >= 0) out[idx] = (out[idx] ?? 0) + 1;
  }
  return out;
}

export interface StatusTotals {
  total: number;
  new: number;
  learning: number;
  learned: number;
}

export function statusTotals(words: readonly Word[], cards: readonly ReviewCard[]): StatusTotals {
  const byWord = cardsByWord(cards);
  const t: StatusTotals = { total: 0, new: 0, learning: 0, learned: 0 };
  for (const w of words) {
    if (w.archived) continue;
    t.total++;
    const s: WordStatus = computeWordStats(byWord.get(w.id) ?? []).status;
    t[s]++;
  }
  return t;
}

export interface ProblemWord {
  word: Word;
  wrong: number;
  lapses: number;
}

export function problemWords(words: readonly Word[], cards: readonly ReviewCard[], limit = 10): ProblemWord[] {
  const byWord = cardsByWord(cards);
  return words
    .filter((w) => !w.archived)
    .map((w) => {
      const s = computeWordStats(byWord.get(w.id) ?? []);
      return { word: w, wrong: s.wrong, lapses: s.lapses };
    })
    .filter((p) => p.wrong + p.lapses > 0)
    .sort((a, b) => b.wrong + b.lapses * 2 - (a.wrong + a.lapses * 2) || b.lapses - a.lapses)
    .slice(0, limit);
}
