/**
 * Spaced repetition: an SM-2 variant with learning steps.
 *
 * Pure module: no side effects, no Date.now(). `now` is always passed in.
 * The algorithm sits behind the `Scheduler` interface so it can later be
 * swapped for FSRS without touching callers.
 */
import type { CardState, Grade, ReviewCard } from '@/db/types';
import { addStudyDays, MINUTE_MS, startOfStudyDay } from './dates';
import { mulberry32 } from './random';

export type SrsFields = Pick<
  ReviewCard,
  'state' | 'easeFactor' | 'intervalDays' | 'repetitions' | 'lapses' | 'dueAt' | 'lastReviewedAt'
>;

export interface ScheduleOptions {
  now: Date;
  dayStartsAtHour: number;
  /** Seed for the interval fuzz. With a seed the result is fully deterministic. */
  seed?: number;
  /** Disable fuzz entirely (used for button previews). Default true. */
  fuzz?: boolean;
}

export interface SchedulePreview {
  grade: Grade;
  state: CardState;
  intervalDays: number;
  dueAt: string;
  /** Delay until due, in ms (learning steps). */
  delayMs: number;
}

export interface Scheduler {
  schedule(card: SrsFields, grade: Grade, opts: ScheduleOptions): SrsFields;
  preview(card: SrsFields, opts: ScheduleOptions): Record<Grade, SchedulePreview>;
}

export const SRS = {
  initialEase: 2.5,
  minEase: 1.3,
  maxEase: 3.0,
  maxIntervalDays: 365,
  learningAgainMs: 1 * MINUTE_MS,
  learningHardMs: 6 * MINUTE_MS,
  learningGoodMs: 10 * MINUTE_MS,
  relearnMs: 10 * MINUTE_MS,
  graduateDays: 1,
  easyGraduateDays: 4,
  lapseMultiplier: 0.5,
  hardMultiplier: 1.2,
  easyBonus: 1.3,
  againEaseDelta: -0.2,
  hardEaseDelta: -0.15,
  easyEaseDelta: 0.15,
  fuzzRatio: 0.05,
  fuzzMinDays: 3,
} as const;

export const GRADES: readonly Grade[] = [0, 1, 2, 3];

export function clampEase(ease: number): number {
  const rounded = Math.round(ease * 100) / 100;
  return Math.min(SRS.maxEase, Math.max(SRS.minEase, rounded));
}

/** Fresh SRS fields for a brand-new card. */
export function newCardFields(now: Date): SrsFields {
  return {
    state: 'new',
    easeFactor: SRS.initialEase,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    dueAt: now.toISOString(),
  };
}

function capInterval(days: number): number {
  return Math.min(SRS.maxIntervalDays, Math.max(1, Math.round(days)));
}

/** ±5% fuzz for intervals ≥ 3 days, so words added together spread out. */
export function fuzzInterval(days: number, rng: () => number): number {
  if (days < SRS.fuzzMinDays) return days;
  const factor = 1 + (rng() * 2 - 1) * SRS.fuzzRatio;
  return capInterval(days * factor);
}

function makeRng(opts: ScheduleOptions): (() => number) | null {
  if (opts.fuzz === false) return null;
  return opts.seed === undefined ? Math.random : mulberry32(opts.seed);
}

function inMinutes(card: SrsFields, now: Date, ms: number, patch: Partial<SrsFields>): SrsFields {
  return {
    ...card,
    ...patch,
    dueAt: new Date(now.getTime() + ms).toISOString(),
    lastReviewedAt: now.toISOString(),
  };
}

function inDays(card: SrsFields, opts: ScheduleOptions, days: number, patch: Partial<SrsFields>): SrsFields {
  const rng = makeRng(opts);
  let interval = capInterval(days);
  if (rng) interval = fuzzInterval(interval, rng);
  const dayStart = startOfStudyDay(opts.now, opts.dayStartsAtHour);
  return {
    ...card,
    ...patch,
    intervalDays: interval,
    dueAt: addStudyDays(dayStart, interval, opts.dayStartsAtHour).toISOString(),
    lastReviewedAt: opts.now.toISOString(),
  };
}

function scheduleLearning(card: SrsFields, grade: Grade, opts: ScheduleOptions): SrsFields {
  const { now } = opts;
  switch (grade) {
    case 0:
      return inMinutes(card, now, SRS.learningAgainMs, { state: 'learning', repetitions: 0, intervalDays: 0 });
    case 1:
      return inMinutes(card, now, SRS.learningHardMs, { state: 'learning', intervalDays: 0 });
    case 2:
      if (card.state === 'learning' && card.repetitions >= 1) {
        return inDays(card, opts, SRS.graduateDays, { state: 'review', repetitions: card.repetitions + 1 });
      }
      return inMinutes(card, now, SRS.learningGoodMs, { state: 'learning', repetitions: 1, intervalDays: 0 });
    case 3:
      return inDays(card, opts, SRS.easyGraduateDays, { state: 'review', repetitions: card.repetitions + 1 });
  }
}

function scheduleRelearning(card: SrsFields, grade: Grade, opts: ScheduleOptions): SrsFields {
  // intervalDays already holds the post-lapse interval (set when the lapse happened).
  const base = Math.max(1, card.intervalDays);
  switch (grade) {
    case 0:
    case 1:
      return inMinutes(card, opts.now, SRS.relearnMs, { state: 'relearning', intervalDays: base });
    case 2:
      return inDays(card, opts, base, { state: 'review', repetitions: card.repetitions + 1 });
    case 3:
      return inDays(card, opts, Math.max(base + 1, base * SRS.easyBonus), {
        state: 'review',
        repetitions: card.repetitions + 1,
      });
  }
}

/** Unfuzzed review intervals for hard/good/easy, each strictly larger than the previous. */
export function reviewIntervals(intervalDays: number, ease: number): { hard: number; good: number; easy: number } {
  const ivl = Math.max(1, intervalDays);
  const hard = capInterval(Math.max(ivl + 1, ivl * SRS.hardMultiplier));
  const good = capInterval(Math.max(hard + 1, ivl * ease));
  const easy = capInterval(Math.max(good + 1, ivl * ease * SRS.easyBonus));
  return { hard, good, easy };
}

function scheduleReview(card: SrsFields, grade: Grade, opts: ScheduleOptions): SrsFields {
  const ease = card.easeFactor;
  if (grade === 0) {
    return inMinutes(card, opts.now, SRS.relearnMs, {
      state: 'relearning',
      lapses: card.lapses + 1,
      repetitions: 0,
      easeFactor: clampEase(ease + SRS.againEaseDelta),
      intervalDays: Math.max(1, Math.round(card.intervalDays * SRS.lapseMultiplier)),
    });
  }
  const ivls = reviewIntervals(card.intervalDays, ease);
  const reps = card.repetitions + 1;
  if (grade === 1) {
    return inDays(card, opts, ivls.hard, {
      state: 'review',
      repetitions: reps,
      easeFactor: clampEase(ease + SRS.hardEaseDelta),
    });
  }
  if (grade === 2) {
    return inDays(card, opts, ivls.good, { state: 'review', repetitions: reps, easeFactor: clampEase(ease) });
  }
  return inDays(card, opts, ivls.easy, {
    state: 'review',
    repetitions: reps,
    easeFactor: clampEase(ease + SRS.easyEaseDelta),
  });
}

export function schedule(card: SrsFields, grade: Grade, opts: ScheduleOptions): SrsFields {
  switch (card.state) {
    case 'new':
    case 'learning':
      return scheduleLearning(card, grade, opts);
    case 'relearning':
      return scheduleRelearning(card, grade, opts);
    case 'review':
      return scheduleReview(card, grade, opts);
  }
}

export function preview(card: SrsFields, opts: ScheduleOptions): Record<Grade, SchedulePreview> {
  const noFuzz: ScheduleOptions = { ...opts, fuzz: false };
  const make = (grade: Grade): SchedulePreview => {
    const next = schedule(card, grade, noFuzz);
    return {
      grade,
      state: next.state,
      intervalDays: next.intervalDays,
      dueAt: next.dueAt,
      delayMs: Date.parse(next.dueAt) - opts.now.getTime(),
    };
  };
  return { 0: make(0), 1: make(1), 2: make(2), 3: make(3) };
}

export const sm2Scheduler: Scheduler = { schedule, preview };

/** The scheduler used by the app. Swap here for FSRS later. */
export const scheduler: Scheduler = sm2Scheduler;

/* ---------- Automatic grading for objective modes ---------- */

export const SLOW_ANSWER_MS = 8000;

export interface AutoGradeInput {
  correct: boolean;
  /** Accepted with a tolerated typo. */
  typo?: boolean;
  responseMs: number;
  /** Letters revealed with the hint button. */
  hintsUsed?: number;
}

/**
 * wrong → Again; correct but slow (> 8 s) or with a typo → Hard; correct → Good.
 * Each hint downgrades one step; needing 2+ hints counts as not known (Again).
 */
export function autoGrade(input: AutoGradeInput): { grade: Grade; wasCorrect: boolean } {
  if (!input.correct) return { grade: 0, wasCorrect: false };
  const hints = Math.max(0, input.hintsUsed ?? 0);
  if (hints >= 2) return { grade: 0, wasCorrect: false };
  let grade: Grade = 2;
  if (hints === 1 || input.typo || input.responseMs > SLOW_ANSWER_MS) grade = 1;
  return { grade, wasCorrect: true };
}

/** Is a grade a "pass" for the in-session queue? */
export function isPassingGrade(grade: Grade): boolean {
  return grade > 0;
}
