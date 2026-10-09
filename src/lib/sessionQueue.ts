/**
 * In-session queue (pure). A card answered wrong comes back 3–5 cards later and
 * must be answered correctly once before the session can finish; each card can
 * be re-inserted at most 3 times. The same word is never shown twice in a row
 * (e.g. EN→RU immediately followed by RU→EN) when it can be avoided.
 */
import type { ConcreteMode, Direction, QueueItem, QueueState } from '@/db/types';
import { randInt, shuffle, type Rng } from './random';

export const MAX_REINSERTIONS = 3;
export const REINSERT_MIN = 3;
export const REINSERT_MAX = 5;

export interface QueueSeed {
  cardId: string;
  wordId: string;
  direction: Direction;
  mode: ConcreteMode;
}

export interface QueueAnswer {
  uid: string;
  correct: boolean;
}

/** Moves items so that no two neighbours share a word id, when possible. */
export function spreadSameWord(items: readonly QueueItem[]): QueueItem[] {
  const out = items.slice();
  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1] as QueueItem;
    if ((out[i] as QueueItem).wordId !== prev.wordId) continue;
    // Find a later item that fits here without creating a new conflict.
    let swapAt = -1;
    for (let j = i + 1; j < out.length; j++) {
      const cand = out[j] as QueueItem;
      if (cand.wordId === prev.wordId) continue;
      const next = out[i + 1];
      if (j !== i + 1 && next && cand.wordId === next.wordId) continue;
      swapAt = j;
      break;
    }
    if (swapAt === -1) {
      // Try moving the conflicting item earlier instead.
      const cur = out[i] as QueueItem;
      for (let j = 0; j < i - 1; j++) {
        const before = out[j - 1];
        const at = out[j] as QueueItem;
        if (at.wordId !== cur.wordId && (!before || before.wordId !== cur.wordId)) {
          out.splice(i, 1);
          out.splice(j, 0, cur);
          break;
        }
      }
      continue;
    }
    const moved = out.splice(swapAt, 1)[0] as QueueItem;
    out.splice(i, 0, moved);
  }
  return out;
}

export function createQueue(seeds: readonly QueueSeed[], opts: { shuffle: boolean; rng?: Rng }): QueueState {
  const ordered = opts.shuffle ? shuffle(seeds, opts.rng) : seeds.slice();
  let seq = 0;
  const items: QueueItem[] = ordered.map((s) => ({ ...s, uid: `${s.cardId}#${seq++}` }));
  const uniqueCards = new Set(seeds.map((s) => s.cardId));
  return {
    items: spreadSameWord(items),
    reinsertions: {},
    pending: {},
    cleared: [],
    totalCards: uniqueCards.size,
    seq,
  };
}

export function currentItem(q: QueueState): QueueItem | undefined {
  return q.items[0];
}

export function isFinished(q: QueueState): boolean {
  return q.items.length === 0;
}

export function progress(q: QueueState): { done: number; total: number } {
  return { done: Math.min(q.cleared.length, q.totalCards), total: q.totalCards };
}

/**
 * The first up to `n` items that share the first item's mode and direction and
 * have distinct words (used by Match pairs). Items with overlapping meaning are
 * excluded by the caller-provided `conflicts` predicate.
 */
export function takeBatch(
  q: QueueState,
  n: number,
  conflicts: (a: QueueItem, b: QueueItem) => boolean = () => false,
): QueueItem[] {
  const first = q.items[0];
  if (!first) return [];
  const batch: QueueItem[] = [first];
  for (const item of q.items.slice(1)) {
    if (batch.length >= n) break;
    if (item.mode !== first.mode || item.direction !== first.direction) continue;
    if (batch.some((b) => b.wordId === item.wordId || conflicts(b, item))) continue;
    batch.push(item);
  }
  return batch;
}

/**
 * Applies one or more answers (several for Match pairs). Answered items leave
 * the queue; wrong ones are re-inserted 3–5 positions later (or at the end).
 */
export function answerItems(q: QueueState, answers: readonly QueueAnswer[], rng: Rng = Math.random): QueueState {
  const byUid = new Map(answers.map((a) => [a.uid, a]));
  const answered = q.items.filter((it) => byUid.has(it.uid));
  let items = q.items.filter((it) => !byUid.has(it.uid));
  const reinsertions = { ...q.reinsertions };
  const pending = { ...q.pending };
  const cleared = q.cleared.slice();
  let seq = q.seq;

  const clear = (cardId: string) => {
    delete pending[cardId];
    if (!cleared.includes(cardId) && !items.some((it) => it.cardId === cardId)) cleared.push(cardId);
  };

  for (const item of answered) {
    const a = byUid.get(item.uid);
    if (!a) continue;
    if (a.correct) {
      clear(item.cardId);
      continue;
    }
    const used = reinsertions[item.cardId] ?? 0;
    if (used >= MAX_REINSERTIONS) {
      // Cap reached: give up on this card for this session so it can end.
      clear(item.cardId);
      continue;
    }
    reinsertions[item.cardId] = used + 1;
    pending[item.cardId] = true;
    const offset = randInt(REINSERT_MIN, REINSERT_MAX, rng);
    const at = Math.min(offset, items.length);
    const again: QueueItem = { ...item, uid: `${item.cardId}#${seq++}` };
    items = [...items.slice(0, at), again, ...items.slice(at)];
  }

  return { ...q, items: spreadSameWord(items), reinsertions, pending, cleared, seq };
}

/** Drops items whose card no longer exists (word deleted while a session was paused). */
export function removeMissing(q: QueueState, exists: (cardId: string) => boolean): QueueState {
  const items = q.items.filter((it) => exists(it.cardId));
  if (items.length === q.items.length) return q;
  const remainingCards = new Set(items.map((it) => it.cardId));
  const removedCards = new Set(q.items.filter((it) => !exists(it.cardId)).map((it) => it.cardId));
  const pending = Object.fromEntries(Object.entries(q.pending).filter(([id]) => remainingCards.has(id))) as Record<
    string,
    true
  >;
  return {
    ...q,
    items: spreadSameWord(items),
    pending,
    totalCards: Math.max(0, q.totalCards - [...removedCards].filter((id) => !q.cleared.includes(id)).length),
  };
}
