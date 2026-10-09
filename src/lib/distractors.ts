/**
 * Wrong options for multiple choice. Never the correct answer, never a word
 * whose translations overlap the target's (synonyms would also be correct),
 * never a duplicate option text. Prefers words sharing a tag, then options of
 * similar length.
 */
import type { Direction, Word } from '@/db/types';
import { normalizeTerm, searchKey } from './normalize';
import { shuffle, type Rng } from './random';

/** The text shown for a word as an answer option. */
export function optionText(word: Pick<Word, 'term' | 'translations'>, direction: Direction): string {
  return direction === 'en_ru' ? word.translations.slice(0, 2).join(', ') : word.term;
}

interface WordKeys {
  term: string;
  translations: Set<string>;
  option: Record<Direction, string>;
}

/**
 * Normalized keys per word object, cached: with a 2,000-word library the
 * distractor checks would otherwise re-normalize every word for every card.
 * Words are immutable snapshots from Dexie, so caching by identity is safe.
 */
const keyCache = new WeakMap<object, WordKeys>();

function keysOf(word: Pick<Word, 'term' | 'translations'>): WordKeys {
  let k = keyCache.get(word);
  if (!k) {
    k = {
      term: normalizeTerm(word.term),
      translations: new Set(word.translations.map((t) => searchKey(t)).filter(Boolean)),
      option: {
        en_ru: searchKey(optionText(word, 'en_ru')),
        ru_en: searchKey(optionText(word, 'ru_en')),
      },
    };
    keyCache.set(word, k);
  }
  return k;
}

/** True when two words could both be correct answers for each other's prompt. */
export function meaningsOverlap(a: Pick<Word, 'term' | 'translations'>, b: Pick<Word, 'term' | 'translations'>): boolean {
  const ka = keysOf(a);
  const kb = keysOf(b);
  if (ka.term === kb.term) return true;
  for (const t of kb.translations) if (ka.translations.has(t)) return true;
  return false;
}

/**
 * Fast eligibility check (early exit): at least `needed` candidates that don't
 * overlap the target's meaning and have distinct option texts. Matches what
 * pickDistractors can always return (its second pass relaxes the
 * "distractors not synonyms of each other" preference).
 */
export function hasEnoughDistractors(target: Word, pool: readonly Word[], direction: Direction, needed = 3): boolean {
  const texts = new Set([keysOf(target).option[direction]]);
  for (const w of pool) {
    if (w.id === target.id || w.translations.length === 0 || meaningsOverlap(target, w)) continue;
    const text = keysOf(w).option[direction];
    if (!text || texts.has(text)) continue;
    texts.add(text);
    if (texts.size - 1 >= needed) return true;
  }
  return false;
}

export function pickDistractors(
  target: Word,
  pool: readonly Word[],
  direction: Direction,
  rng: Rng = Math.random,
  count = 3,
): Word[] {
  const targetText = keysOf(target).option[direction];
  const targetLen = targetText.length;
  const targetTags = new Set(target.tagIds);

  const candidates = shuffle(
    pool.filter((w) => w.id !== target.id && !meaningsOverlap(target, w) && w.translations.length > 0),
    rng,
  );
  const scored = candidates.map((w) => {
    const len = keysOf(w).option[direction].length;
    const diff = Math.abs(len - targetLen);
    return {
      w,
      tag: w.tagIds.some((t) => targetTags.has(t)) ? 0 : 1,
      len: diff <= 2 ? 0 : diff <= 5 ? 1 : 2,
    };
  });
  // Stable sort keeps the random order inside each bucket.
  scored.sort((a, b) => a.tag - b.tag || a.len - b.len);

  const out: Word[] = [];
  const seenTexts = new Set([targetText]);
  // Pass 1 prefers distractors that are not synonyms of each other; pass 2 fills any gap.
  for (const strict of [true, false]) {
    for (const { w } of scored) {
      if (out.length >= count) break;
      const text = keysOf(w).option[direction];
      if (!text || seenTexts.has(text)) continue;
      if (strict && out.some((o) => meaningsOverlap(o, w))) continue;
      seenTexts.add(text);
      out.push(w);
    }
  }
  return out;
}

export interface ChoiceOption {
  wordId: string;
  text: string;
  correct: boolean;
}

/** Correct answer + distractors, shuffled. */
export function buildOptions(
  target: Word,
  pool: readonly Word[],
  direction: Direction,
  rng: Rng = Math.random,
): ChoiceOption[] {
  const distractors = pickDistractors(target, pool, direction, rng);
  return shuffle(
    [
      { wordId: target.id, text: optionText(target, direction), correct: true },
      ...distractors.map((d) => ({ wordId: d.id, text: optionText(d, direction), correct: false })),
    ],
    rng,
  );
}
