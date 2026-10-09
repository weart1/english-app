/**
 * Fill-in-the-blank: find the term (or a simple inflection of it) inside an
 * example sentence. Inflections: -s, -es, -ed, -d, -ing, plus e-drop
 * (make → making), y → i (study → studies) and final consonant doubling
 * (stop → stopped). For phrases ("give up") the first word is inflected.
 */
import { unifyApostrophes } from './normalize';
import type { Word } from '@/db/types';

const VOWELS = 'aeiou';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** All accepted surface forms of a single word. */
export function inflections(word: string): string[] {
  const w = word.toLowerCase();
  const forms = new Set<string>([w, `${w}s`, `${w}es`, `${w}ed`, `${w}d`, `${w}ing`]);
  if (w.endsWith('e') && w.length > 2) {
    forms.add(`${w.slice(0, -1)}ing`);
  }
  const last = w.at(-1) ?? '';
  const prev = w.at(-2) ?? '';
  if (last === 'y' && prev && !VOWELS.includes(prev)) {
    forms.add(`${w.slice(0, -1)}ies`);
    forms.add(`${w.slice(0, -1)}ied`);
  }
  if (/^[a-z]+$/.test(w) && w.length >= 3 && !VOWELS.includes(last) && !'wxy'.includes(last) && VOWELS.includes(prev)) {
    forms.add(`${w}${last}ed`);
    forms.add(`${w}${last}ing`);
  }
  return [...forms];
}

/** Regex alternatives for a term (single word or phrase). */
function termAlternatives(term: string): string[] {
  const parts = unifyApostrophes(term).trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return [];
  const [first, ...rest] = parts as [string, ...string[]];
  const restPattern = rest.map(escapeRegExp).join('\\s+');
  const firstForms = inflections(first).map(escapeRegExp);
  const alts = firstForms.map((f) => (restPattern ? `${f}\\s+${restPattern}` : f));
  if (rest.length > 0) {
    // Also allow inflecting the last word ("look forward to" stays exact, "ice creams").
    const head = [first, ...rest.slice(0, -1)].map(escapeRegExp).join('\\s+');
    for (const f of inflections(rest[rest.length - 1] as string)) alts.push(`${head}\\s+${escapeRegExp(f)}`);
  }
  // Longest first so "running" wins over "run".
  return [...new Set(alts)].sort((a, b) => b.length - a.length);
}

export interface ClozeMatch {
  sentence: string;
  before: string;
  answer: string;
  after: string;
}

export function findCloze(term: string, sentence: string): ClozeMatch | null {
  const alts = termAlternatives(term);
  if (alts.length === 0) return null;
  const text = unifyApostrophes(sentence);
  const re = new RegExp(`(^|[^\\p{L}\\p{N}'])(${alts.join('|')})(?=$|[^\\p{L}\\p{N}'])`, 'iu');
  const m = re.exec(text);
  if (!m || m[2] === undefined) return null;
  const start = m.index + (m[1]?.length ?? 0);
  const answer = m[2];
  return {
    sentence,
    before: text.slice(0, start),
    answer,
    after: text.slice(start + answer.length),
  };
}

/** The first example of the word that contains the term, if any. */
export function clozeFor(word: Pick<Word, 'term' | 'examples'>): ClozeMatch | null {
  for (const ex of word.examples) {
    const m = findCloze(word.term, ex);
    if (m) return m;
  }
  return null;
}

export function hasCloze(word: Pick<Word, 'term' | 'examples'>): boolean {
  return clozeFor(word) !== null;
}
