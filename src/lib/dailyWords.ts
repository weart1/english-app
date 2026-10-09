/**
 * "Слова дня" selection (pure). Deterministic per study day, skips what is
 * already in the library or marked as known.
 */
import type { BankItem, CefrLevel } from '@/data/wordbank/types';
import { normalizeTerm } from './normalize';
import { hashString, mulberry32, shuffle } from './random';

export interface BankFilter {
  levels: readonly CefrLevel[];
  /** Topic keys; empty = all. */
  topics: readonly string[];
  kind: 'words' | 'phrases' | 'both';
}

export function filterBank(bank: readonly BankItem[], f: BankFilter): BankItem[] {
  const levels = new Set(f.levels);
  const topics = new Set(f.topics);
  return bank.filter(
    (i) =>
      (levels.size === 0 || levels.has(i.level)) &&
      (topics.size === 0 || topics.has(i.topic)) &&
      (f.kind === 'both' || (f.kind === 'words' ? i.kind === 'word' : i.kind === 'phrase')),
  );
}

/** Library terms as a normalized set (to skip items the user already has). */
export function libraryTermSet(words: readonly { term: string }[]): Set<string> {
  return new Set(words.map((w) => normalizeTerm(w.term)));
}

export function isInLibrary(item: BankItem, terms: ReadonlySet<string>): boolean {
  return terms.has(normalizeTerm(item.term));
}

/**
 * Picks `count` item ids for a day. Mixes words and phrases when both are
 * allowed (roughly 2:1), and is stable for the same inputs.
 */
export function pickDaily(
  pool: readonly BankItem[],
  opts: { count: number; seed: string; exclude: ReadonlySet<string>; libraryTerms: ReadonlySet<string> },
): string[] {
  const available = pool.filter((i) => !opts.exclude.has(i.id) && !isInLibrary(i, opts.libraryTerms));
  const rng = mulberry32(hashString(opts.seed));
  const words = shuffle(available.filter((i) => i.kind === 'word'), rng);
  const phrases = shuffle(available.filter((i) => i.kind === 'phrase'), rng);
  const out: string[] = [];
  // Interleave: word, word, phrase, word, word, phrase…
  let w = 0;
  let p = 0;
  while (out.length < opts.count && (w < words.length || p < phrases.length)) {
    const wantPhrase = out.length % 3 === 2;
    if ((wantPhrase && p < phrases.length) || w >= words.length) out.push((phrases[p++] as BankItem).id);
    else out.push((words[w++] as BankItem).id);
  }
  return out;
}
