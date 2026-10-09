import { describe, expect, it } from 'vitest';
import {
  autoGrade,
  clampEase,
  fuzzInterval,
  newCardFields,
  preview,
  reviewIntervals,
  schedule,
  SRS,
  type ScheduleOptions,
  type SrsFields,
} from '@/lib/srs';
import { mulberry32 } from '@/lib/random';
import type { Grade } from '@/db/types';

const H = 4;
// 2026-06-10 15:00 local (Europe/Berlin, see vite.config.ts)
const NOW = new Date(2026, 5, 10, 15, 0, 0);
const opts = (extra: Partial<ScheduleOptions> = {}): ScheduleOptions => ({
  now: NOW,
  dayStartsAtHour: H,
  fuzz: false,
  ...extra,
});

const minutesFromNow = (iso: string) => (Date.parse(iso) - NOW.getTime()) / 60_000;
/** Study day `n` after today, at 04:00 local. */
const dayStart = (n: number) => new Date(2026, 5, 10 + n, H, 0, 0).toISOString();

function card(patch: Partial<SrsFields> = {}): SrsFields {
  return { ...newCardFields(NOW), ...patch };
}

function reviewCard(intervalDays: number, ease = 2.5, patch: Partial<SrsFields> = {}): SrsFields {
  return card({ state: 'review', intervalDays, easeFactor: ease, repetitions: 3, ...patch });
}

describe('srs: new and learning cards', () => {
  it('new + Again → learning, due in 1 minute, repetitions reset', () => {
    const next = schedule(card(), 0, opts());
    expect(next.state).toBe('learning');
    expect(minutesFromNow(next.dueAt)).toBe(1);
    expect(next.repetitions).toBe(0);
    expect(next.intervalDays).toBe(0);
    expect(next.easeFactor).toBe(2.5);
    expect(next.lastReviewedAt).toBe(NOW.toISOString());
  });

  it('new + Hard → learning, due in 6 minutes', () => {
    const next = schedule(card(), 1, opts());
    expect(next.state).toBe('learning');
    expect(minutesFromNow(next.dueAt)).toBe(6);
  });

  it('new + Good → learning step, due in 10 minutes', () => {
    const next = schedule(card(), 2, opts());
    expect(next.state).toBe('learning');
    expect(next.repetitions).toBe(1);
    expect(minutesFromNow(next.dueAt)).toBe(10);
  });

  it('learning + Good (after the 10-minute step) → graduates to 1 day', () => {
    const step = schedule(card(), 2, opts());
    const next = schedule(step, 2, opts());
    expect(next.state).toBe('review');
    expect(next.intervalDays).toBe(1);
    expect(next.dueAt).toBe(dayStart(1));
  });

  it('new + Easy → graduates immediately to 4 days', () => {
    const next = schedule(card(), 3, opts());
    expect(next.state).toBe('review');
    expect(next.intervalDays).toBe(4);
    expect(next.dueAt).toBe(dayStart(4));
    expect(next.easeFactor).toBe(2.5);
  });

  it('learning + Again resets the step so the next Good is the 10-minute step again', () => {
    const step = schedule(card(), 2, opts());
    const again = schedule(step, 0, opts());
    expect(again.repetitions).toBe(0);
    const good = schedule(again, 2, opts());
    expect(good.state).toBe('learning');
    expect(minutesFromNow(good.dueAt)).toBe(10);
  });

  it('learning + Hard keeps the step', () => {
    const step = schedule(card(), 2, opts());
    const hard = schedule(step, 1, opts());
    expect(hard.state).toBe('learning');
    expect(hard.repetitions).toBe(1);
    expect(minutesFromNow(hard.dueAt)).toBe(6);
    expect(schedule(hard, 2, opts()).state).toBe('review');
  });

  it('learning + Easy graduates to 4 days', () => {
    const step = schedule(card(), 0, opts());
    const easy = schedule(step, 3, opts());
    expect(easy.state).toBe('review');
    expect(easy.intervalDays).toBe(4);
  });
});

describe('srs: review cards', () => {
  it('Again → lapse, ease −0.20, relearning in 10 minutes, interval halved', () => {
    const next = schedule(reviewCard(10, 2.5, { lapses: 1 }), 0, opts());
    expect(next.state).toBe('relearning');
    expect(next.lapses).toBe(2);
    expect(next.easeFactor).toBeCloseTo(2.3);
    expect(minutesFromNow(next.dueAt)).toBe(10);
    expect(next.intervalDays).toBe(5);
    expect(next.repetitions).toBe(0);
  });

  it('Again on a 1-day interval keeps at least 1 day', () => {
    expect(schedule(reviewCard(1), 0, opts()).intervalDays).toBe(1);
  });

  it('Hard → ease −0.15, interval × 1.2', () => {
    const next = schedule(reviewCard(10), 1, opts());
    expect(next.state).toBe('review');
    expect(next.easeFactor).toBeCloseTo(2.35);
    expect(next.intervalDays).toBe(12);
    expect(next.dueAt).toBe(dayStart(12));
  });

  it('Good → interval × ease, ease unchanged', () => {
    const next = schedule(reviewCard(10), 2, opts());
    expect(next.intervalDays).toBe(25);
    expect(next.easeFactor).toBe(2.5);
    expect(next.repetitions).toBe(4);
  });

  it('Easy → ease +0.15, interval × ease × 1.3', () => {
    const next = schedule(reviewCard(10), 3, opts());
    expect(next.easeFactor).toBeCloseTo(2.65);
    expect(next.intervalDays).toBe(33); // 10 × 2.5 × 1.3 = 32.5 → 33
  });

  it('intervals always grow: hard < good < easy, and hard > current', () => {
    for (const ivl of [1, 2, 3, 7, 30, 100]) {
      for (const ease of [1.3, 2.0, 2.5, 3.0]) {
        const r = reviewIntervals(ivl, ease);
        if (ivl < SRS.maxIntervalDays - 3) {
          expect(r.hard).toBeGreaterThan(ivl);
          expect(r.good).toBeGreaterThan(r.hard);
          expect(r.easy).toBeGreaterThan(r.good);
        }
      }
    }
  });

  it('caps intervals at 365 days', () => {
    const next = schedule(reviewCard(300, 3.0), 3, opts());
    expect(next.intervalDays).toBe(365);
    const next2 = schedule(reviewCard(365, 2.5), 2, opts());
    expect(next2.intervalDays).toBe(365);
  });

  it('rounds review intervals to whole days', () => {
    for (const g of [1, 2, 3] as Grade[]) {
      const next = schedule(reviewCard(7, 2.37), g, opts());
      expect(Number.isInteger(next.intervalDays)).toBe(true);
    }
  });
});

describe('srs: relearning', () => {
  const lapsed = () => schedule(reviewCard(10), 0, opts());

  it('Again / Hard stay in relearning for 10 minutes', () => {
    for (const g of [0, 1] as Grade[]) {
      const next = schedule(lapsed(), g, opts());
      expect(next.state).toBe('relearning');
      expect(minutesFromNow(next.dueAt)).toBe(10);
      expect(next.lapses).toBe(1); // no double-counting
    }
  });

  it('Good returns to review with max(1, interval × 0.5)', () => {
    const next = schedule(lapsed(), 2, opts());
    expect(next.state).toBe('review');
    expect(next.intervalDays).toBe(5);
    expect(next.dueAt).toBe(dayStart(5));
  });

  it('Easy returns to review with a slightly longer interval', () => {
    const next = schedule(lapsed(), 3, opts());
    expect(next.state).toBe('review');
    expect(next.intervalDays).toBe(7); // 5 × 1.3 = 6.5 → 7
  });
});

describe('srs: ease clamping', () => {
  it('never goes below 1.3', () => {
    let c = reviewCard(5, 1.35);
    c = schedule(c, 0, opts());
    expect(c.easeFactor).toBe(1.3);
    c = schedule(reviewCard(5, 1.3), 1, opts());
    expect(c.easeFactor).toBe(1.3);
  });

  it('never goes above 3.0', () => {
    const c = schedule(reviewCard(5, 2.95), 3, opts());
    expect(c.easeFactor).toBe(3.0);
  });

  it('clampEase handles floating point noise', () => {
    expect(clampEase(2.5 - 0.2 - 0.15)).toBe(2.15);
    expect(clampEase(0)).toBe(1.3);
    expect(clampEase(9)).toBe(3);
  });

  it('repeated failures keep ease clamped', () => {
    let c = reviewCard(20, 2.5);
    for (let i = 0; i < 20; i++) {
      c = schedule(c, 0, opts());
      c = schedule(c, 2, opts());
    }
    expect(c.easeFactor).toBe(1.3);
    expect(c.lapses).toBe(20);
    expect(c.intervalDays).toBeGreaterThanOrEqual(1);
  });
});

describe('srs: fuzz', () => {
  it('is deterministic for a given seed', () => {
    const a = schedule(reviewCard(40), 2, { now: NOW, dayStartsAtHour: H, seed: 42 });
    const b = schedule(reviewCard(40), 2, { now: NOW, dayStartsAtHour: H, seed: 42 });
    expect(a).toEqual(b);
  });

  it('stays within ±5% and spreads values across seeds', () => {
    const seen = new Set<number>();
    for (let seed = 0; seed < 200; seed++) {
      const next = schedule(reviewCard(40), 2, { now: NOW, dayStartsAtHour: H, seed });
      expect(next.intervalDays).toBeGreaterThanOrEqual(95);
      expect(next.intervalDays).toBeLessThanOrEqual(105);
      seen.add(next.intervalDays);
    }
    expect(seen.size).toBeGreaterThan(3);
  });

  it('does not fuzz intervals below 3 days', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 50; i++) {
      expect(fuzzInterval(1, rng)).toBe(1);
      expect(fuzzInterval(2, rng)).toBe(2);
    }
  });

  it('never exceeds the 365-day cap', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 100; i++) expect(fuzzInterval(365, rng)).toBeLessThanOrEqual(365);
  });

  it('fuzz:false disables fuzz even with a seed', () => {
    const next = schedule(reviewCard(40), 2, { now: NOW, dayStartsAtHour: H, seed: 3, fuzz: false });
    expect(next.intervalDays).toBe(100);
  });
});

describe('srs: preview', () => {
  it('describes each grade for a new card', () => {
    const p = preview(card(), opts());
    expect(p[0].delayMs).toBe(60_000);
    expect(p[1].delayMs).toBe(6 * 60_000);
    expect(p[2].delayMs).toBe(10 * 60_000);
    expect(p[3].state).toBe('review');
    expect(p[3].intervalDays).toBe(4);
  });

  it('does not mutate the input card', () => {
    const c = reviewCard(10);
    const copy = { ...c };
    preview(c, opts());
    schedule(c, 3, opts());
    expect(c).toEqual(copy);
  });
});

describe('srs: due dates follow study days', () => {
  it('a review at 01:30 (before the 04:00 day start) belongs to the previous study day', () => {
    const late = new Date(2026, 5, 11, 1, 30);
    const next = schedule(reviewCard(1), 2, { now: late, dayStartsAtHour: H, fuzz: false });
    // Study day is June 10; +3 days (1 × 2.5 = 2.5 → 3) → June 13 04:00
    expect(next.intervalDays).toBe(3);
    expect(next.dueAt).toBe(new Date(2026, 5, 13, H).toISOString());
  });

  it('graduating across the spring DST change lands on 04:00 local', () => {
    const beforeDst = new Date(2026, 2, 28, 20, 0); // Sat 28 Mar 2026, DST starts Sun 29 Mar
    const next = schedule(card(), 3, { now: beforeDst, dayStartsAtHour: H, fuzz: false });
    const due = new Date(next.dueAt);
    expect(due.getHours()).toBe(4);
    expect(due.getDate()).toBe(1); // 28 Mar + 4 days = 1 Apr
    expect(due.getMonth()).toBe(3);
  });

  it('graduating across the autumn DST change lands on 04:00 local', () => {
    const beforeDst = new Date(2026, 9, 24, 22, 0); // DST ends Sun 25 Oct 2026
    const next = schedule(card(), 3, { now: beforeDst, dayStartsAtHour: H, fuzz: false });
    const due = new Date(next.dueAt);
    expect(due.getHours()).toBe(4);
    expect(due.getDate()).toBe(28);
  });
});

describe('autoGrade', () => {
  it('maps wrong → Again', () => {
    expect(autoGrade({ correct: false, responseMs: 1000 })).toEqual({ grade: 0, wasCorrect: false });
  });
  it('maps correct → Good', () => {
    expect(autoGrade({ correct: true, responseMs: 3000 })).toEqual({ grade: 2, wasCorrect: true });
  });
  it('maps slow (> 8 s) → Hard', () => {
    expect(autoGrade({ correct: true, responseMs: 8001 }).grade).toBe(1);
    expect(autoGrade({ correct: true, responseMs: 8000 }).grade).toBe(2);
  });
  it('maps tolerated typo → Hard', () => {
    expect(autoGrade({ correct: true, typo: true, responseMs: 1000 })).toEqual({ grade: 1, wasCorrect: true });
  });
  it('hints downgrade the grade', () => {
    expect(autoGrade({ correct: true, responseMs: 1000, hintsUsed: 1 }).grade).toBe(1);
    expect(autoGrade({ correct: true, responseMs: 1000, hintsUsed: 2 })).toEqual({ grade: 0, wasCorrect: false });
  });
});
