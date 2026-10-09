import { db } from '@/db/schema';
import { importWords } from '@/db/repo';
import type { BankItem } from '@/data/wordbank/types';
import { topicByKey } from '@/data/wordbank/topics';
import { markDuplicates, type ImportRow } from '@/lib/importParser';
import { ru } from '@/i18n/ru';

/**
 * Adds dictionary items to the library in one transaction (words + cards + a tag
 * per topic). Items already in the library are skipped.
 */
export async function addBankItems(items: readonly BankItem[]): Promise<number> {
  const existing = await db.words.toArray();
  const rows: ImportRow[] = items.map((i, n) => ({
    line: n + 1,
    term: i.term,
    translations: i.translations,
    examples: i.example ? [i.example] : [],
    tagNames: [topicByKey(i.topic)?.label ?? i.topic],
    note: ru.daily.levelNote(i.level),
    status: 'new',
  }));
  const res = await importWords(markDuplicates(rows, existing), 'skip');
  return res.added;
}
