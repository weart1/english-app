/**
 * Pure library list logic: derived stats, search, filters, sort.
 */
import type { ReviewCard, Word } from '@/db/types';
import { cardsByWord, computeWordStats, type WordStats, type WordStatus } from './wordStatus';
import { searchKey } from './normalize';
import { DAY_MS } from './dates';

export interface LibraryEntry {
  word: Word;
  stats: WordStats;
  /** Normalized text for search (term, translations, note). */
  key: string;
}

export interface LibraryFilters {
  status: WordStatus | null;
  tagId: string | null;
  hard: boolean;
  recent: boolean;
  /** true = show only archived words; false = hide archived words. */
  archived: boolean;
}

export const EMPTY_FILTERS: LibraryFilters = {
  status: null,
  tagId: null,
  hard: false,
  recent: false,
  archived: false,
};

export type LibrarySort = 'created' | 'alpha' | 'mistakes' | 'due';

export function buildEntries(words: readonly Word[], cards: readonly ReviewCard[]): LibraryEntry[] {
  const byWord = cardsByWord(cards);
  return words.map((word) => ({
    word,
    stats: computeWordStats(byWord.get(word.id) ?? []),
    key: searchKey([word.term, ...word.translations, word.note ?? ''].join('   ')),
  }));
}

export function matchesQuery(entry: LibraryEntry, query: string): boolean {
  const q = searchKey(query);
  if (!q) return true;
  return q.split(' ').every((token) => entry.key.includes(token));
}

export function filterEntries(
  entries: readonly LibraryEntry[],
  query: string,
  filters: LibraryFilters,
  now: Date,
): LibraryEntry[] {
  const recentCutoff = now.getTime() - 7 * DAY_MS;
  const q = searchKey(query);
  const tokens = q ? q.split(' ') : [];
  return entries.filter((e) => {
    if (e.word.archived !== filters.archived) return false;
    if (filters.status && e.stats.status !== filters.status) return false;
    if (filters.tagId && !e.word.tagIds.includes(filters.tagId)) return false;
    if (filters.hard && !e.stats.hard) return false;
    if (filters.recent && Date.parse(e.word.createdAt) < recentCutoff) return false;
    if (tokens.length && !tokens.every((t) => e.key.includes(t))) return false;
    return true;
  });
}

const collator = typeof Intl !== 'undefined' ? new Intl.Collator('en', { sensitivity: 'base' }) : null;

export function sortEntries(entries: readonly LibraryEntry[], sort: LibrarySort): LibraryEntry[] {
  const out = entries.slice();
  switch (sort) {
    case 'created':
      out.sort((a, b) => (a.word.createdAt < b.word.createdAt ? 1 : a.word.createdAt > b.word.createdAt ? -1 : 0));
      break;
    case 'alpha':
      out.sort((a, b) => (collator ? collator.compare(a.word.term, b.word.term) : a.word.term.localeCompare(b.word.term)));
      break;
    case 'mistakes':
      out.sort(
        (a, b) =>
          b.stats.wrong + b.stats.lapses - (a.stats.wrong + a.stats.lapses) ||
          (a.word.createdAt < b.word.createdAt ? 1 : -1),
      );
      break;
    case 'due':
      out.sort((a, b) => {
        const ad = a.stats.nextDue;
        const bd = b.stats.nextDue;
        if (ad && bd) return ad < bd ? -1 : ad > bd ? 1 : 0;
        if (ad) return -1;
        if (bd) return 1;
        return 0;
      });
      break;
  }
  return out;
}
