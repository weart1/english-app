/**
 * Bulk import parsing (pure). Nothing here touches the database: the result is
 * a preview the user confirms before anything is written.
 */
import { cleanLine, cleanList, normalizeTerm, splitTranslations } from './normalize';
import { parseCsv } from './csv';
import { ru } from '@/i18n/ru';

export type ImportStatus = 'new' | 'duplicate' | 'duplicate-in-file' | 'error';

export interface ImportRow {
  line: number;
  term: string;
  translations: string[];
  transcription?: string;
  examples: string[];
  tagNames: string[];
  status: ImportStatus;
  error?: string;
  /** For `duplicate`: the existing word id. */
  existingId?: string;
}

export const MAX_LINE_LENGTH = 1000;

/** Splits "word - перевод" on the first supported separator. */
export function splitPair(line: string): [string, string] | null {
  if (line.includes('\t')) {
    const i = line.indexOf('\t');
    return [line.slice(0, i), line.slice(i + 1)];
  }
  // Spaced dashes first, so hyphenated terms ("well-known - известный") stay intact.
  const spaced = /(^|\s)[-–—](\s|$)/.exec(line);
  if (spaced) return [line.slice(0, spaced.index), line.slice(spaced.index + spaced[0].length)];
  const dash = /[–—]/.exec(line);
  if (dash) return [line.slice(0, dash.index), line.slice(dash.index + 1)];
  const colon = /[:;]/.exec(line);
  if (colon) return [line.slice(0, colon.index), line.slice(colon.index + 1)];
  // "apple-яблоко": a plain hyphen between a Latin part and a Cyrillic part.
  const mixed = /^(.*?[A-Za-z0-9'’.)\]/])\s*-\s*([Ѐ-ӿ].*)$/.exec(line);
  if (mixed && mixed[1] && mixed[2]) return [mixed[1], mixed[2]];
  return null;
}

/** "apple [ˈæp.əl]" / "apple /ˈæpl/" → term + transcription. */
export function extractTranscription(term: string): { term: string; transcription?: string } {
  const m = /^(.*?)\s*([[/][^\]/]+[\]/])\s*$/.exec(term);
  if (m && m[1] && m[1].trim() && m[2]) {
    const raw = m[2];
    const inner = raw.slice(1, -1).trim();
    return { term: m[1].trim(), transcription: raw.startsWith('[') ? `[${inner}]` : `/${inner}/` };
  }
  return { term: term.trim() };
}

function errorRow(line: number, term: string, error: string): ImportRow {
  return { line, term, translations: [], examples: [], tagNames: [], status: 'error', error };
}

function buildRow(
  line: number,
  rawTerm: string,
  rawTranslations: string,
  extra: { transcription?: string; examples?: string[]; tags?: string[] } = {},
): ImportRow {
  const { term, transcription: fromTerm } = extractTranscription(cleanLine(rawTerm));
  if (!term) return errorRow(line, '', ru.import.errNoTerm);
  const translations = splitTranslations(rawTranslations);
  if (translations.length === 0) return errorRow(line, term, ru.import.errNoTranslation);
  const transcription = cleanLine(extra.transcription ?? '') || fromTerm;
  return {
    line,
    term,
    translations,
    ...(transcription ? { transcription } : {}),
    examples: cleanList(extra.examples ?? []),
    tagNames: cleanList(extra.tags ?? []),
    status: 'new',
  };
}

/** Plain text: one word per line, "word - перевод". Empty lines and "#" comments are skipped. */
export function parseTextImport(text: string): ImportRow[] {
  const rows: ImportRow[] = [];
  const lines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    if (line.length > MAX_LINE_LENGTH) {
      rows.push(errorRow(i + 1, line.slice(0, 40), ru.import.errTooLong));
      return;
    }
    const pair = splitPair(line);
    if (!pair) {
      rows.push(errorRow(i + 1, line, ru.import.errNoSeparator));
      return;
    }
    rows.push(buildRow(i + 1, pair[0], pair[1]));
  });
  return rows;
}

const HEADER_ALIASES: Record<string, keyof typeof COLS> = {
  term: 'term',
  word: 'term',
  english: 'term',
  слово: 'term',
  translations: 'translations',
  translation: 'translations',
  перевод: 'translations',
  переводы: 'translations',
  transcription: 'transcription',
  транскрипция: 'transcription',
  example: 'example',
  examples: 'example',
  пример: 'example',
  примеры: 'example',
  tags: 'tags',
  tag: 'tags',
  теги: 'tags',
  тег: 'tags',
};

const COLS = { term: 0, translations: 1, transcription: 2, example: 3, tags: 4 };

/** CSV: term, translations, transcription, example, tags. Header row optional. */
export function parseCsvImport(text: string): ImportRow[] {
  const table = parseCsv(text);
  if (table.length === 0) return [];
  let cols: Record<keyof typeof COLS, number> = { ...COLS };
  let start = 0;
  const first = table[0]?.fields.map((f) => f.trim().toLowerCase()) ?? [];
  if (first.some((f) => HEADER_ALIASES[f] === 'term')) {
    const map: Partial<Record<keyof typeof COLS, number>> = {};
    first.forEach((f, i) => {
      const key = HEADER_ALIASES[f];
      if (key && map[key] === undefined) map[key] = i;
    });
    cols = { term: map.term ?? 0, translations: map.translations ?? 1, transcription: map.transcription ?? -1, example: map.example ?? -1, tags: map.tags ?? -1 };
    start = 1;
  }
  const get = (fields: string[], i: number) => (i >= 0 ? (fields[i] ?? '') : '');
  return table.slice(start).map(({ line, fields }) => {
    if (fields.join('').length > MAX_LINE_LENGTH * 4) return errorRow(line, get(fields, cols.term).slice(0, 40), ru.import.errTooLong);
    return buildRow(line, get(fields, cols.term), get(fields, cols.translations), {
      transcription: get(fields, cols.transcription),
      examples: get(fields, cols.example).split('|'),
      tags: get(fields, cols.tags).split(/[,;|]/),
    });
  });
}

/** Marks rows that already exist in the library or repeat earlier rows of the same file. */
export function markDuplicates(rows: readonly ImportRow[], existing: readonly { id: string; term: string }[]): ImportRow[] {
  const library = new Map(existing.map((w) => [normalizeTerm(w.term), w.id]));
  const seen = new Set<string>();
  return rows.map((r) => {
    if (r.status === 'error') return r;
    const key = normalizeTerm(r.term);
    if (seen.has(key)) return { ...r, status: 'duplicate-in-file' };
    seen.add(key);
    const existingId = library.get(key);
    return existingId ? { ...r, status: 'duplicate', existingId } : { ...r, status: 'new' };
  });
}

export interface ImportSummary {
  toAdd: number;
  duplicates: number;
  errors: number;
  inFileDuplicates: number;
}

export function summarize(rows: readonly ImportRow[]): ImportSummary {
  return {
    toAdd: rows.filter((r) => r.status === 'new').length,
    duplicates: rows.filter((r) => r.status === 'duplicate').length,
    errors: rows.filter((r) => r.status === 'error').length,
    inFileDuplicates: rows.filter((r) => r.status === 'duplicate-in-file').length,
  };
}
