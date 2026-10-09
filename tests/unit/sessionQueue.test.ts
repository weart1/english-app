import { describe, expect, it } from 'vitest';
import {
  answerItems,
  createQueue,
  currentItem,
  isFinished,
  MAX_REINSERTIONS,
  progress,
  removeMissing,
  spreadSameWord,
  takeBatch,
  type QueueSeed,
} from '@/lib/sessionQueue';
import { mulberry32 } from '@/lib/random';
import type { QueueItem, QueueState } from '@/db/types';

function seeds(words: number, directions: ('en_ru' | 'ru_en')[] = ['en_ru']): QueueSeed[] {
  const out: QueueSeed[] = [];
  for (const d of directions) {
    for (let i = 0; i < words; i++) {
      out.push({ cardId: `w${i}:${d}`, wordId: `w${i}`, direction: d, mode: 'typing' });
    }
  }
  return out;
}

function answerCurrent(q: QueueState, correct: boolean, seed = 1): QueueState {
  const cur = currentItem(q);
  if (!cur) throw new Error('empty');
  return answerItems(q, [{ uid: cur.uid, correct }], mulberry32(seed));
}

function hasAdjacentSameWord(items: readonly QueueItem[]): boolean {
  return items.some((it, i) => i > 0 && items[i - 1]?.wordId === it.wordId);
}

describe('createQueue', () => {
  it('keeps the given order when not shuffling', () => {
    const q = createQueue(seeds(4), { shuffle: false });
    expect(q.items.map((i) => i.cardId)).toEqual(['w0:en_ru', 'w1:en_ru', 'w2:en_ru', 'w3:en_ru']);
    expect(q.totalCards).toBe(4);
    expect(new Set(q.items.map((i) => i.uid)).size).toBe(4);
  });

  it('never puts the same word back-to-back after shuffling (both directions)', () => {
    for (let s = 0; s < 200; s++) {
      const q = createQueue(seeds(5, ['en_ru', 'ru_en']), { shuffle: true, rng: mulberry32(s) });
      expect(hasAdjacentSameWord(q.items)).toBe(false);
      expect(q.items).toHaveLength(10);
    }
  });

  it('handles a single word in both directions (unavoidable adjacency, no crash)', () => {
    const q = createQueue(seeds(1, ['en_ru', 'ru_en']), { shuffle: true, rng: mulberry32(3) });
    expect(q.items).toHaveLength(2);
  });
});

describe('answerItems', () => {
  it('correct answers clear the card', () => {
    let q = createQueue(seeds(3), { shuffle: false });
    q = answerCurrent(q, true);
    expect(q.items).toHaveLength(2);
    expect(q.cleared).toEqual(['w0:en_ru']);
    expect(progress(q)).toEqual({ done: 1, total: 3 });
  });

  it('wrong answers are re-inserted 3–5 positions later', () => {
    for (let s = 0; s < 100; s++) {
      let q = createQueue(seeds(10), { shuffle: false });
      q = answerCurrent(q, false, s);
      const idx = q.items.findIndex((i) => i.cardId === 'w0:en_ru');
      expect(idx).toBeGreaterThanOrEqual(3);
      expect(idx).toBeLessThanOrEqual(5);
      expect(q.pending['w0:en_ru']).toBe(true);
      expect(q.cleared).toEqual([]);
      expect(q.items).toHaveLength(10);
    }
  });

  it('re-inserted items get a fresh uid', () => {
    let q = createQueue(seeds(6), { shuffle: false });
    const firstUid = currentItem(q)?.uid;
    q = answerCurrent(q, false);
    const again = q.items.find((i) => i.cardId === 'w0:en_ru');
    expect(again?.uid).not.toBe(firstUid);
  });

  it('appends at the end when fewer than 3 cards remain', () => {
    let q = createQueue(seeds(2), { shuffle: false });
    q = answerCurrent(q, false);
    expect(q.items.map((i) => i.cardId)).toEqual(['w1:en_ru', 'w0:en_ru']);
  });

  it('a card must be answered correctly before the session can finish', () => {
    let q = createQueue(seeds(1), { shuffle: false });
    q = answerCurrent(q, false);
    expect(isFinished(q)).toBe(false);
    q = answerCurrent(q, true);
    expect(isFinished(q)).toBe(true);
    expect(q.cleared).toEqual(['w0:en_ru']);
    expect(q.pending).toEqual({});
  });

  it(`caps re-insertions at ${MAX_REINSERTIONS} per card`, () => {
    let q = createQueue(seeds(1), { shuffle: false });
    for (let i = 0; i < MAX_REINSERTIONS; i++) {
      q = answerCurrent(q, false);
      expect(isFinished(q)).toBe(false);
    }
    expect(q.reinsertions['w0:en_ru']).toBe(MAX_REINSERTIONS);
    q = answerCurrent(q, false); // 4th wrong: dropped
    expect(isFinished(q)).toBe(true);
    expect(q.cleared).toEqual(['w0:en_ru']);
  });

  it('always terminates even if every answer is wrong', () => {
    let q = createQueue(seeds(6, ['en_ru', 'ru_en']), { shuffle: true, rng: mulberry32(9) });
    let steps = 0;
    while (!isFinished(q)) {
      q = answerCurrent(q, false, steps);
      steps++;
      expect(steps).toBeLessThan(1000);
    }
    expect(steps).toBe(12 * (MAX_REINSERTIONS + 1));
    expect(progress(q)).toEqual({ done: 12, total: 12 });
  });

  it('keeps words apart after re-insertion', () => {
    for (let s = 0; s < 100; s++) {
      let q = createQueue(seeds(4, ['en_ru', 'ru_en']), { shuffle: true, rng: mulberry32(s) });
      const rng = mulberry32(s + 1000);
      while (!isFinished(q)) {
        const cur = currentItem(q) as QueueItem;
        q = answerItems(q, [{ uid: cur.uid, correct: rng() > 0.5 }], rng);
        expect(hasAdjacentSameWord(q.items)).toBe(false);
      }
    }
  });

  it('supports batch answers (match pairs)', () => {
    let q = createQueue(seeds(7), { shuffle: false });
    const batch = takeBatch(q, 5);
    expect(batch).toHaveLength(5);
    q = answerItems(
      q,
      batch.map((b, i) => ({ uid: b.uid, correct: i !== 2 })),
      mulberry32(1),
    );
    expect(q.cleared).toHaveLength(4);
    expect(q.items.map((i) => i.cardId)).toContain('w2:en_ru');
    expect(q.items).toHaveLength(3);
  });
});

describe('takeBatch', () => {
  it('skips duplicates of the same word and conflicting items', () => {
    const q = createQueue(seeds(3, ['en_ru', 'ru_en']), { shuffle: false });
    const batch = takeBatch(q, 5);
    expect(new Set(batch.map((b) => b.wordId)).size).toBe(batch.length);
    expect(batch.every((b) => b.direction === 'en_ru')).toBe(true);
    const noW1 = takeBatch(q, 5, (_a, b) => b.wordId === 'w1');
    expect(noW1.map((b) => b.wordId)).toEqual(['w0', 'w2']);
  });
});

describe('removeMissing', () => {
  it('drops deleted cards and adjusts the total', () => {
    const q = createQueue(seeds(4), { shuffle: false });
    const next = removeMissing(q, (id) => id !== 'w2:en_ru');
    expect(next.items.map((i) => i.cardId)).not.toContain('w2:en_ru');
    expect(next.totalCards).toBe(3);
    expect(removeMissing(next, () => true)).toBe(next);
  });
});

describe('spreadSameWord', () => {
  it('separates adjacent duplicates', () => {
    const mk = (w: string, d: 'en_ru' | 'ru_en'): QueueItem => ({ uid: `${w}${d}`, cardId: `${w}:${d}`, wordId: w, direction: d, mode: 'typing' });
    const out = spreadSameWord([mk('a', 'en_ru'), mk('a', 'ru_en'), mk('b', 'en_ru'), mk('b', 'ru_en')]);
    expect(hasAdjacentSameWord(out)).toBe(false);
  });
});
