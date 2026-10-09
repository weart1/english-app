import type { ReviewCard, Word } from '@/db/types';

export type WordStatus = 'new' | 'learning' | 'learned';

export const LEARNED_INTERVAL_DAYS = 21;

/**
 * Derived (never stored) status:
 * new = both cards new; learned = both cards interval ≥ 21 days; else learning.
 */
export function wordStatus(cards: readonly ReviewCard[]): WordStatus {
  if (cards.length === 0 || cards.every((c) => c.state === 'new')) return 'new';
  if (
    cards.length >= 2 &&
    cards.every((c) => c.state === 'review' && c.intervalDays >= LEARNED_INTERVAL_DAYS)
  ) {
    return 'learned';
  }
  return 'learning';
}

/** 0..1 progress towards "learned", averaged over both directions. */
export function wordProgress(cards: readonly ReviewCard[]): number {
  if (cards.length === 0) return 0;
  let sum = 0;
  for (const c of cards) {
    if (c.state === 'new') continue;
    const base = c.state === 'review' ? Math.min(1, c.intervalDays / LEARNED_INTERVAL_DAYS) : 0.05;
    sum += Math.max(0.05, base);
  }
  return Math.min(1, sum / Math.max(2, cards.length));
}

export interface WordStats {
  status: WordStatus;
  progress: number;
  wrong: number;
  lapses: number;
  correct: number;
  /** Earliest due date among non-new cards (ISO), if any. */
  nextDue?: string;
  hard: boolean;
}

export function isHard(wrong: number, lapses: number): boolean {
  return wrong >= 3 || lapses >= 2;
}

export function computeWordStats(cards: readonly ReviewCard[]): WordStats {
  let wrong = 0;
  let lapses = 0;
  let correct = 0;
  let nextDue: string | undefined;
  for (const c of cards) {
    wrong += c.wrongCount;
    lapses += c.lapses;
    correct += c.correctCount;
    if (c.state !== 'new' && (nextDue === undefined || c.dueAt < nextDue)) nextDue = c.dueAt;
  }
  return {
    status: wordStatus(cards),
    progress: wordProgress(cards),
    wrong,
    lapses,
    correct,
    nextDue,
    hard: isHard(wrong, lapses),
  };
}

/** Groups cards by word id. */
export function cardsByWord(cards: readonly ReviewCard[]): Map<string, ReviewCard[]> {
  const map = new Map<string, ReviewCard[]>();
  for (const c of cards) {
    const list = map.get(c.wordId);
    if (list) list.push(c);
    else map.set(c.wordId, [c]);
  }
  return map;
}

export function isArchivedOrMissing(word: Word | undefined): boolean {
  return !word || word.archived;
}
