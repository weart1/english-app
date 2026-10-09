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

function translationKeys(word: Pick<Word, 'translations'>): Set<string> {
  return new Set(word.translations.map((t) => searchKey(t)).filter(Boolean));
}

/** True when two words could both be correct answers for each other's prompt. */
export function meaningsOverlap(a: Pick<Word, 'term' | 'translations'>, b: Pick<Word, 'term' | 'translations'>): boolean {
  if (normalizeTerm(a.term) === normalizeTerm(b.term)) return true;
  const ka = translationKeys(a);
  for (const t of b.translations) if (ka.has(searchKey(t))) return true;
  return false;
}

export function pickDistractors(
  target: Word,
  pool: readonly Word[],
  direction: Direction,
  rng: Rng = Math.random,
  count = 3,
): Word[] {
  const targetText = searchKey(optionText(target, direction));
  const targetLen = targetText.length;
  const targetTags = new Set(target.tagIds);

  const candidates = shuffle(
    pool.filter((w) => w.id !== target.id && !meaningsOverlap(target, w) && w.translations.length > 0),
    rng,
  );
  const scored = candidates.map((w) => {
    const len = searchKey(optionText(w, direction)).length;
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
  for (const { w } of scored) {
    if (out.length >= count) break;
    const text = searchKey(optionText(w, direction));
    if (!text || seenTexts.has(text)) continue;
    // Also avoid two distractors that are synonyms of each other.
    if (out.some((o) => meaningsOverlap(o, w))) continue;
    seenTexts.add(text);
    out.push(w);
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
