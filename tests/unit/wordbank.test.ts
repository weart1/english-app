import { describe, expect, it } from 'vitest';
import { getBank } from '@/data/wordbank';
import { ALL_TOPICS } from '@/data/wordbank/topics';
import { findCloze } from '@/lib/cloze';
import { normalizeTerm } from '@/lib/normalize';

const bank = getBank();
const words = bank.filter((i) => i.kind === 'word');
const phrases = bank.filter((i) => i.kind === 'phrase');

describe('built-in word bank', () => {
  it('has about 2000 words and 1000 phrases', () => {
    expect(words.length).toBeGreaterThanOrEqual(2000);
    expect(phrases.length).toBeGreaterThanOrEqual(1000);
  });

  it('has unique ids and terms per kind', () => {
    expect(new Set(bank.map((i) => i.id)).size).toBe(bank.length);
    expect(new Set(words.map((i) => normalizeTerm(i.term))).size).toBe(words.length);
  });

  it('every item has a translation and a known topic', () => {
    const topics = new Set(ALL_TOPICS.map((t) => t.key));
    for (const i of bank) {
      expect(i.translations.length, i.term).toBeGreaterThan(0);
      expect(topics.has(i.topic), i.topic).toBe(true);
    }
  });

  it('covers every level and topic', () => {
    for (const l of ['A1', 'A2', 'B1', 'B2', 'C1']) expect(bank.some((i) => i.level === l)).toBe(true);
    for (const t of ALL_TOPICS) expect(bank.filter((i) => i.topic === t.key).length, t.key).toBeGreaterThanOrEqual(50);
  });

  it('every example contains its term (so "Пропуск в предложении" works)', () => {
    const bad = bank.filter((i) => i.example && !findCloze(i.term, i.example)).map((i) => `${i.term} :: ${i.example}`);
    expect(bad).toEqual([]);
  }, 60_000);
});
