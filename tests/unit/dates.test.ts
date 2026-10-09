import { describe, expect, it } from 'vitest';
import {
  addStudyDays,
  endOfStudyDay,
  isDueToday,
  localDateKey,
  mondayIndex,
  startOfStudyDay,
  studyDayKey,
  studyDaysBetween,
} from '@/lib/dates';

describe('test environment', () => {
  it('runs in a DST time zone (Europe/Berlin)', () => {
    // Winter offset +60, summer +120 minutes.
    expect(new Date(2026, 0, 15).getTimezoneOffset()).toBe(-60);
    expect(new Date(2026, 6, 15).getTimezoneOffset()).toBe(-120);
  });
});

describe('startOfStudyDay', () => {
  it('after the start hour → same calendar day', () => {
    const s = startOfStudyDay(new Date(2026, 5, 10, 15, 0), 4);
    expect(s).toEqual(new Date(2026, 5, 10, 4, 0));
  });

  it('exactly at the start hour → same calendar day', () => {
    const s = startOfStudyDay(new Date(2026, 5, 10, 4, 0, 0, 0), 4);
    expect(s).toEqual(new Date(2026, 5, 10, 4, 0));
  });

  it('in the 00:00–04:00 window → previous calendar day', () => {
    for (const [h, m] of [
      [0, 0],
      [1, 30],
      [3, 59],
    ] as const) {
      const s = startOfStudyDay(new Date(2026, 5, 11, h, m), 4);
      expect(s).toEqual(new Date(2026, 5, 10, 4, 0));
    }
  });

  it('one minute before the start hour belongs to the previous day', () => {
    expect(studyDayKey(new Date(2026, 5, 11, 3, 59, 59), 4)).toBe('2026-06-10');
    expect(studyDayKey(new Date(2026, 5, 11, 4, 0, 0), 4)).toBe('2026-06-11');
  });

  it('works across month and year boundaries', () => {
    expect(studyDayKey(new Date(2027, 0, 1, 2, 0), 4)).toBe('2026-12-31');
    expect(studyDayKey(new Date(2026, 2, 1, 1, 0), 4)).toBe('2026-02-28');
  });

  it('dayStartsAtHour = 0 behaves like calendar days', () => {
    expect(studyDayKey(new Date(2026, 5, 11, 0, 30), 0)).toBe('2026-06-11');
    expect(studyDayKey(new Date(2026, 5, 10, 23, 59), 0)).toBe('2026-06-10');
  });

  it('clamps invalid hours', () => {
    expect(startOfStudyDay(new Date(2026, 5, 10, 12), 99).getHours()).toBe(23);
    expect(startOfStudyDay(new Date(2026, 5, 10, 12), -5).getHours()).toBe(0);
  });
});

describe('DST transitions (Europe/Berlin)', () => {
  // Spring forward: Sun 29 Mar 2026, 02:00 → 03:00 (23-hour day).
  it('spring: the study day around the change is 23 hours long and still starts at 04:00', () => {
    const start = startOfStudyDay(new Date(2026, 2, 29, 12, 0), 4);
    expect(start.getHours()).toBe(4);
    const end = endOfStudyDay(new Date(2026, 2, 29, 12, 0), 4);
    expect(end).toEqual(new Date(2026, 2, 30, 4, 0));
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(24);
    // The day containing the change (Sat 04:00 → Sun 04:00) is 23 hours.
    const sat = startOfStudyDay(new Date(2026, 2, 28, 12, 0), 4);
    const sun = addStudyDays(sat, 1, 4);
    expect((sun.getTime() - sat.getTime()) / 3_600_000).toBe(23);
  });

  it('spring: 02:30 local (non-existent hour) still maps to the previous study day', () => {
    const t = new Date(2026, 2, 29, 2, 30); // JS shifts to 03:30
    expect(studyDayKey(t, 4)).toBe('2026-03-28');
  });

  // Fall back: Sun 25 Oct 2026, 03:00 → 02:00 (25-hour day).
  it('autumn: the day containing the change is 25 hours long', () => {
    const sat = startOfStudyDay(new Date(2026, 9, 24, 12, 0), 4);
    const sun = addStudyDays(sat, 1, 4);
    expect(sun).toEqual(new Date(2026, 9, 25, 4, 0));
    expect((sun.getTime() - sat.getTime()) / 3_600_000).toBe(25);
  });

  it('autumn: both 02:30 occurrences belong to the previous study day', () => {
    const first = new Date(Date.UTC(2026, 9, 25, 0, 30)); // 02:30 CEST
    const second = new Date(Date.UTC(2026, 9, 25, 1, 30)); // 02:30 CET
    expect(first.getHours()).toBe(2);
    expect(second.getHours()).toBe(2);
    expect(studyDayKey(first, 4)).toBe('2026-10-24');
    expect(studyDayKey(second, 4)).toBe('2026-10-24');
  });

  it('addStudyDays over a DST change keeps the local start hour', () => {
    const start = new Date(2026, 2, 27, 4, 0);
    for (let n = 0; n < 5; n++) {
      expect(addStudyDays(start, n, 4).getHours()).toBe(4);
    }
    const autumn = new Date(2026, 9, 23, 4, 0);
    for (let n = 0; n < 5; n++) {
      expect(addStudyDays(autumn, n, 4).getHours()).toBe(4);
    }
  });

  it('studyDaysBetween counts calendar days, not 24h blocks', () => {
    const a = new Date(2026, 2, 28, 4);
    const b = new Date(2026, 2, 30, 4); // 47 hours apart
    expect(studyDaysBetween(a, b)).toBe(2);
    const c = new Date(2026, 9, 24, 4);
    const d = new Date(2026, 9, 26, 4); // 49 hours apart
    expect(studyDaysBetween(c, d)).toBe(2);
  });
});

describe('isDueToday', () => {
  const now = new Date(2026, 5, 10, 15, 0);
  it('includes anything due before the end of the study day (next day 04:00)', () => {
    expect(isDueToday(new Date(2026, 5, 10, 23, 0).toISOString(), now, 4)).toBe(true);
    expect(isDueToday(new Date(2026, 5, 11, 3, 59).toISOString(), now, 4)).toBe(true);
    expect(isDueToday(new Date(2026, 5, 11, 4, 0).toISOString(), now, 4)).toBe(false);
  });
  it('overdue cards are due', () => {
    expect(isDueToday(new Date(2026, 4, 1).toISOString(), now, 4)).toBe(true);
  });
  it('at 01:00 the current study day still ends at 04:00 the same morning', () => {
    const lateNight = new Date(2026, 5, 11, 1, 0);
    expect(isDueToday(new Date(2026, 5, 11, 3, 0).toISOString(), lateNight, 4)).toBe(true);
    expect(isDueToday(new Date(2026, 5, 11, 5, 0).toISOString(), lateNight, 4)).toBe(false);
  });
  it('treats an invalid date as due (fail safe)', () => {
    expect(isDueToday('garbage', now, 4)).toBe(true);
  });
});

describe('helpers', () => {
  it('localDateKey pads', () => {
    expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
  it('mondayIndex', () => {
    expect(mondayIndex(new Date(2026, 5, 8))).toBe(0); // Monday
    expect(mondayIndex(new Date(2026, 5, 14))).toBe(6); // Sunday
  });
});
