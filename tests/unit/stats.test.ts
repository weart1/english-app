import { describe, expect, it } from 'vitest';
import { accuracySince, activeDayKeys, computeStreak, forecast, heatLevel, heatmap, problemWords, statusTotals, wordsReviewedToday } from '@/lib/stats';
import { needsBackupReminder } from '@/screens/today/Banners';
import { cardsFor, word } from './helpers';

const H = 4;
const NOW = new Date(2026, 5, 10, 15, 0); // Wed 10 Jun 2026, 15:00
const at = (d: number, h: number, m = 0) => new Date(2026, 5, d, h, m).toISOString();

describe('wordsReviewedToday', () => {
  it('counts distinct words since the start of the study day', () => {
    const logs = [
      { wordId: 'a', reviewedAt: at(10, 9) },
      { wordId: 'a', reviewedAt: at(10, 10) },
      { wordId: 'b', reviewedAt: at(10, 5) },
      { wordId: 'c', reviewedAt: at(10, 3) }, // belongs to yesterday's study day
    ];
    expect(wordsReviewedToday(logs, NOW, H)).toBe(2);
  });
});

describe('computeStreak', () => {
  it('counts consecutive days ending today', () => {
    const keys = activeDayKeys([at(10, 9), at(9, 20), at(8, 8), at(6, 8)], H);
    expect(computeStreak(keys, NOW, H)).toBe(3);
  });
  it('keeps yesterday’s streak alive when nothing was done yet today', () => {
    const keys = activeDayKeys([at(9, 20), at(8, 8)], H);
    expect(computeStreak(keys, NOW, H)).toBe(2);
  });
  it('is 0 after a missed day', () => {
    const keys = activeDayKeys([at(8, 20)], H);
    expect(computeStreak(keys, NOW, H)).toBe(0);
  });
  it('a 01:30 review counts for the previous study day', () => {
    const keys = activeDayKeys([at(10, 1, 30), at(9, 12)], H);
    expect([...keys].sort()).toEqual(['2026-06-09']);
    expect(computeStreak(keys, NOW, H)).toBe(1);
  });
});

describe('accuracySince', () => {
  it('computes the ratio, null when empty', () => {
    const logs = [
      { wasCorrect: true, reviewedAt: at(10, 9) },
      { wasCorrect: false, reviewedAt: at(9, 9) },
      { wasCorrect: true, reviewedAt: at(1, 9) },
    ];
    expect(accuracySince(logs, new Date(2026, 5, 5))).toEqual({ correct: 1, total: 2, ratio: 0.5 });
    expect(accuracySince([], NOW).ratio).toBeNull();
  });
});

describe('heatmap', () => {
  it('builds 16 Monday-first weeks ending this week, today marked', () => {
    const grid = heatmap([at(10, 9), at(10, 11), at(9, 9)], NOW, H, 16);
    expect(grid).toHaveLength(16);
    expect(grid.every((c) => c.length === 7)).toBe(true);
    const cells = grid.flat();
    const today = cells.find((c) => c.isToday);
    expect(today?.key).toBe('2026-06-10');
    expect(today?.count).toBe(2);
    expect(grid[0]?.[0]?.date.getDay()).toBe(1); // Monday
    expect(cells.filter((c) => c.isFuture).map((c) => c.key)).toEqual(['2026-06-11', '2026-06-12', '2026-06-13', '2026-06-14']);
  });
  it('levels', () => {
    expect([0, 1, 5, 15, 30].map(heatLevel)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('forecast', () => {
  it('buckets due cards by study day, overdue counts as today, skips new/archived', () => {
    const cards = [
      { state: 'review' as const, dueAt: at(1, 9), wordId: 'a' },
      { state: 'review' as const, dueAt: at(11, 2), wordId: 'a' }, // before 04:00 → still today
      { state: 'review' as const, dueAt: at(11, 5), wordId: 'b' },
      { state: 'learning' as const, dueAt: at(16, 5), wordId: 'b' },
      { state: 'review' as const, dueAt: at(30, 5), wordId: 'b' },
      { state: 'new' as const, dueAt: at(1, 1), wordId: 'c' },
      { state: 'review' as const, dueAt: at(10, 9), wordId: 'arch' },
    ];
    expect(forecast(cards, NOW, H, 7, new Set(['arch']))).toEqual([2, 1, 0, 0, 0, 0, 1]);
  });
});

describe('totals and problem words', () => {
  it('derives statuses and ranks problems', () => {
    const a = word('a', ['а']);
    const b = word('b', ['б']);
    const c = word('c', ['в'], { archived: true });
    const cards = [
      ...cardsFor(a),
      ...cardsFor(b, { state: 'review', intervalDays: 30, wrongCount: 2, lapses: 1 }),
      ...cardsFor(c, { state: 'review', wrongCount: 9 }),
    ];
    expect(statusTotals([a, b, c], cards)).toEqual({ total: 2, new: 1, learning: 0, learned: 1 });
    expect(problemWords([a, b, c], cards).map((p) => p.word.id)).toEqual([b.id]);
  });
});

describe('backup reminder', () => {
  it('shows only with ≥ 10 words and no backup in 14 days', () => {
    expect(needsBackupReminder(9, undefined, NOW)).toBe(false);
    expect(needsBackupReminder(10, undefined, NOW)).toBe(true);
    expect(needsBackupReminder(10, new Date(2026, 5, 1).toISOString(), NOW)).toBe(false);
    expect(needsBackupReminder(10, new Date(2026, 4, 20).toISOString(), NOW)).toBe(true);
  });
});
