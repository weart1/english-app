import { normalizeTerm, splitTranslations } from '@/lib/normalize';
import { CEFR_LEVELS, type BankItem, type BankKind, type CefrLevel } from './types';

/**
 * Data lines: `term|перевод, перевод|LEVEL|Optional example sentence.`
 * Blank lines and lines starting with `#` are ignored.
 */
export function parseBankLines(raw: string, topic: string, kind: BankKind): BankItem[] {
  const out: BankItem[] = [];
  for (const line of raw.split('\n')) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const [term = '', tr = '', level = '', example = ''] = l.split('|').map((x) => x.trim());
    if (!term || !tr || !CEFR_LEVELS.includes(level as CefrLevel)) {
      throw new Error(`Bad word bank line in ${topic}: ${l}`);
    }
    out.push({
      id: `${kind === 'word' ? 'w' : 'p'}:${normalizeTerm(term)}`,
      kind,
      term,
      translations: splitTranslations(tr),
      level: level as CefrLevel,
      topic,
      ...(example ? { example } : {}),
    });
  }
  return out;
}

/** Drops later duplicates (same id) so every id is unique. */
export function dedupe(items: readonly BankItem[]): BankItem[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
}
