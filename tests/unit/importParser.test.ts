import { beforeEach, describe, expect, it } from 'vitest';
import { extractTranscription, markDuplicates, parseCsvImport, parseTextImport, splitPair, summarize } from '@/lib/importParser';
import { parseCsv, toCsv } from '@/lib/csv';
import { addWord, clearAllData, importWords } from '@/db/repo';
import { db } from '@/db/schema';

describe('splitPair / text import separators', () => {
  it.each([
    ['apple - яблоко', 'apple', 'яблоко'],
    ['apple — яблоко', 'apple', 'яблоко'],
    ['apple – яблоко', 'apple', 'яблоко'],
    ['apple—яблоко', 'apple', 'яблоко'],
    ['apple: яблоко', 'apple', 'яблоко'],
    ['apple; яблоко', 'apple', 'яблоко'],
    ['apple\tяблоко', 'apple', 'яблоко'],
    ['apple-яблоко', 'apple', 'яблоко'],
    ['well-known - известный', 'well-known', 'известный'],
    ["don't - не делать", "don't", 'не делать'],
  ])('%s', (line, term, tr) => {
    const rows = parseTextImport(line);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ term, translations: [tr], status: 'new' });
  });

  it('splits multiple translations by commas', () => {
    expect(parseTextImport('give up - сдаваться, бросать')[0]?.translations).toEqual(['сдаваться', 'бросать']);
  });

  it('extracts a transcription from the term part', () => {
    expect(parseTextImport('apple [ˈæp.əl] - яблоко')[0]).toMatchObject({ term: 'apple', transcription: '[ˈæp.əl]' });
    expect(extractTranscription('cat /kæt/')).toEqual({ term: 'cat', transcription: '/kæt/' });
  });

  it('skips empty lines and comments, handles CRLF and BOM, keeps line numbers', () => {
    const rows = parseTextImport('﻿apple - яблоко\r\n\r\n# comment\r\ncat - кот\r\n');
    expect(rows.map((r) => [r.line, r.term])).toEqual([
      [1, 'apple'],
      [4, 'cat'],
    ]);
  });

  it('reports malformed rows with a reason', () => {
    const rows = parseTextImport('justaword\n - перевод\napple -\nwell-known');
    expect(rows.map((r) => r.status)).toEqual(['error', 'error', 'error', 'error']);
    expect(rows[0]?.error).toBe('Не найден разделитель между словом и переводом');
    expect(rows[1]?.error).toBe('Пустое слово');
    expect(rows[2]?.error).toBe('Нет перевода');
    expect(splitPair('no separator here')).toBeNull();
  });
});

describe('CSV', () => {
  it('parses quoted fields, commas and newlines inside quotes, escaped quotes', () => {
    const rows = parseCsv('a,"b, c","d ""q"" e"\n"multi\nline",x,y');
    expect(rows[0]?.fields).toEqual(['a', 'b, c', 'd "q" e']);
    expect(rows[1]?.fields).toEqual(['multi\nline', 'x', 'y']);
    expect(rows[1]?.line).toBe(2);
  });

  it('handles BOM, CRLF and a header row', () => {
    const text = '﻿term,translations,transcription,example,tags\r\napple,"яблоко, яблоня",/ˈæpl/,I like apples. | An apple a day,"food, fruit"\r\n\r\ncat,кот,,,\r\n';
    const rows = parseCsvImport(text);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      term: 'apple',
      translations: ['яблоко', 'яблоня'],
      transcription: '/ˈæpl/',
      examples: ['I like apples.', 'An apple a day'],
      tagNames: ['food', 'fruit'],
      line: 2,
    });
    expect(rows[1]).toMatchObject({ term: 'cat', translations: ['кот'], examples: [], tagNames: [] });
  });

  it('works without a header and with ";" delimiter (Excel RU)', () => {
    const rows = parseCsvImport('apple;"яблоко, яблоня"\ndog;собака');
    expect(rows.map((r) => r.term)).toEqual(['apple', 'dog']);
    expect(rows[0]?.translations).toEqual(['яблоко', 'яблоня']);
  });

  it('maps header columns by name in any order', () => {
    const rows = parseCsvImport('tags,translations,term\nanimals,кот,cat');
    expect(rows[0]).toMatchObject({ term: 'cat', translations: ['кот'], tagNames: ['animals'] });
  });

  it('flags malformed CSV rows', () => {
    const rows = parseCsvImport('term,translations\n,кот\ndog,');
    expect(rows.map((r) => r.status)).toEqual(['error', 'error']);
  });

  it('round-trips through toCsv', () => {
    const data = [
      ['term', 'translations'],
      ['say "hi"', 'привет, здравствуй'],
      ['multi\nline', ' spaced '],
    ];
    expect(parseCsv(toCsv(data)).map((r) => r.fields)).toEqual(data);
  });
});

describe('markDuplicates', () => {
  it('marks library and in-file duplicates (normalized)', () => {
    const rows = markDuplicates(parseTextImport('Apple - яблоко\ncat - кот\ncat - кошка\nnew - новый'), [{ id: 'w1', term: 'apple' }]);
    expect(rows.map((r) => r.status)).toEqual(['duplicate', 'new', 'duplicate-in-file', 'new']);
    expect(rows[0]?.existingId).toBe('w1');
    expect(summarize(rows)).toEqual({ toAdd: 2, duplicates: 1, errors: 0, inFileDuplicates: 1 });
  });
});

describe('importWords (transactional)', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('adds words, cards and tags; skip / update / add duplicates', async () => {
    const existing = await addWord({ term: 'apple', translations: ['яблоко'] });
    const parse = () =>
      markDuplicates(parseCsvImport('term,translations,tags\napple,яблоня,food\ncat,кот,"animals, home"\nbad,'), [existing]);

    const skip = await importWords(parse(), 'skip');
    expect(skip).toEqual({ added: 1, updated: 0, skipped: 2 });
    expect(await db.cards.count()).toBe(4);
    expect((await db.tags.toArray()).map((t) => t.name).sort()).toEqual(['animals', 'home']);

    const upd = await importWords(parse(), 'update');
    expect(upd.updated).toBe(1);
    expect((await db.words.get(existing.id))?.translations).toEqual(['яблоко', 'яблоня']);

    const add = await importWords(parse(), 'add');
    expect(add.added).toBe(2);
    expect(await db.words.where('term').equals('apple').count()).toBe(2);
  });

  it('writes nothing when any row fails', async () => {
    const rows = [
      { term: 'ok', translations: ['ок'], examples: [], tagNames: ['t'], status: 'new' as const },
      { term: 'broken', translations: [], examples: [], tagNames: [], status: 'new' as const },
    ];
    await expect(importWords(rows, 'skip')).rejects.toThrow();
    expect(await db.words.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);
    expect(await db.tags.count()).toBe(0);
  });
});
