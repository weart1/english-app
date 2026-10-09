import type { ReviewCard, Word } from '@/db/types';
import { makeCard } from '@/db/repo';

let n = 0;
export function word(term: string, translations: string[], patch: Partial<Word> = {}): Word {
  n++;
  const iso = new Date(2026, 0, 1, 0, 0, n).toISOString();
  return {
    id: patch.id ?? `id-${term}-${n}`,
    term,
    translations,
    examples: [],
    tagIds: [],
    createdAt: iso,
    updatedAt: iso,
    archived: false,
    ...patch,
  };
}

export function cardsFor(w: Word, patch: Partial<ReviewCard> = {}): ReviewCard[] {
  const now = new Date(2026, 0, 1);
  return [{ ...makeCard(w.id, 'en_ru', now), ...patch }, { ...makeCard(w.id, 'ru_en', now), ...patch }];
}
