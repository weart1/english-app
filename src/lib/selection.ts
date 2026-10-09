/**
 * Resolves "which words / cards to train" from SelectionCriteria. Pure.
 */
import type { Direction, ReviewCard, SelectionCriteria, Word } from '@/db/types';
import { isDueToday } from './dates';
import { shuffle, type Rng } from './random';
import { cardsByWord, computeWordStats } from './wordStatus';

export interface SelectionContext {
  words: readonly Word[];
  cards: readonly ReviewCard[];
  now: Date;
  dayStartsAtHour: number;
  rng?: Rng;
}

const byCreatedAsc = (a: Word, b: Word) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0);

/** A non-new card that is due before the end of the current study day. */
export function isCardDue(card: ReviewCard, now: Date, dayStartsAtHour: number): boolean {
  return card.state !== 'new' && isDueToday(card.dueAt, now, dayStartsAtHour);
}

/** Candidate word ids for a source, before applying count/order. */
export function sourceWordIds(criteria: SelectionCriteria, ctx: SelectionContext): string[] {
  const active = ctx.words.filter((w) => !w.archived);
  const byWord = cardsByWord(ctx.cards);
  switch (criteria.source) {
    case 'selected': {
      // Explicit choice: keep the user's order, skip words deleted since then.
      const existing = new Set(ctx.words.map((w) => w.id));
      return Array.from(new Set(criteria.wordIds ?? [])).filter((id) => existing.has(id));
    }
    case 'tag':
      return active
        .filter((w) => !!criteria.tagId && w.tagIds.includes(criteria.tagId))
        .sort(byCreatedAsc)
        .map((w) => w.id);
    case 'all':
      return active.slice().sort(byCreatedAsc).map((w) => w.id);
    case 'hard':
      return active
        .map((w) => ({ w, s: computeWordStats(byWord.get(w.id) ?? []) }))
        .filter((x) => x.s.hard)
        .sort((a, b) => b.s.wrong + b.s.lapses - (a.s.wrong + a.s.lapses))
        .map((x) => x.w.id);
    case 'due': {
      const due: { id: string; at: string }[] = [];
      for (const w of active) {
        const dueCards = (byWord.get(w.id) ?? []).filter((c) => isCardDue(c, ctx.now, ctx.dayStartsAtHour));
        if (dueCards.length === 0) continue;
        const at = dueCards.reduce((m, c) => (c.dueAt < m ? c.dueAt : m), dueCards[0]?.dueAt ?? '');
        due.push({ id: w.id, at });
      }
      return due.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)).map((d) => d.id);
    }
    case 'new':
      return active
        .filter((w) => (byWord.get(w.id) ?? []).every((c) => c.state === 'new'))
        .sort(byCreatedAsc)
        .map((w) => w.id);
  }
}

export interface ResolvedSelection {
  wordIds: string[];
  /** Words available in the source (before the count limit). */
  available: number;
}

export function resolveSelection(criteria: SelectionCriteria, ctx: SelectionContext): ResolvedSelection {
  const pool = sourceWordIds(criteria, ctx);
  const ordered = criteria.order === 'random' ? shuffle(pool, ctx.rng) : pool;
  const limit = criteria.count === 'all' ? ordered.length : Math.max(0, criteria.count);
  return { wordIds: ordered.slice(0, limit), available: pool.length };
}

/** The cards (word × direction) a session will train for the chosen words. */
export function sessionCards(
  wordIds: readonly string[],
  directions: readonly Direction[],
  criteria: Pick<SelectionCriteria, 'source'>,
  ctx: Pick<SelectionContext, 'cards' | 'now' | 'dayStartsAtHour'>,
): ReviewCard[] {
  const dirs = new Set(directions);
  const byWord = cardsByWord(ctx.cards);
  const out: ReviewCard[] = [];
  // Direction-major order: all EN→RU first, then RU→EN (keeps words apart when not shuffled).
  for (const d of directions) {
    for (const id of wordIds) {
      const card = (byWord.get(id) ?? []).find((c) => c.direction === d);
      if (!card || !dirs.has(card.direction)) continue;
      if (criteria.source === 'due' && !isCardDue(card, ctx.now, ctx.dayStartsAtHour)) continue;
      if (criteria.source === 'new' && card.state !== 'new') continue;
      out.push(card);
    }
  }
  return out;
}
