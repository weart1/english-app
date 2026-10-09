import { describe, expect, it } from 'vitest';
import { buildOptions, meaningsOverlap, optionText, pickDistractors } from '@/lib/distractors';
import { mulberry32 } from '@/lib/random';
import { word } from './helpers';

const big = word('big', ['большой']);
const large = word('large', ['большой', 'крупный']);
const huge = word('huge', ['огромный', 'Большой']); // overlaps after normalization
const cat = word('cat', ['кот', 'кошка']);
const dog = word('dog', ['собака']);
const house = word('house', ['дом']);
const run = word('run', ['бежать']);
const tree = word('tree', ['дерево']);
const pool = [big, large, huge, cat, dog, house, run, tree];

describe('pickDistractors', () => {
  it('never includes the target or words with overlapping translations', () => {
    for (let s = 0; s < 100; s++) {
      for (const dir of ['en_ru', 'ru_en'] as const) {
        const d = pickDistractors(big, pool, dir, mulberry32(s));
        expect(d).toHaveLength(3);
        const ids = d.map((w) => w.id);
        expect(ids).not.toContain(big.id);
        expect(ids).not.toContain(large.id);
        expect(ids).not.toContain(huge.id);
      }
    }
  });

  it('treats ё/е and case as the same translation', () => {
    const elka = word('fir', ['ёлка']);
    const elka2 = word('spruce', ['Елка']);
    expect(meaningsOverlap(elka, elka2)).toBe(true);
    const d = pickDistractors(elka, [elka, elka2, cat, dog, house], 'en_ru', mulberry32(1));
    expect(d.map((w) => w.id)).not.toContain(elka2.id);
  });

  it('never returns two distractors that are synonyms of each other', () => {
    for (let s = 0; s < 50; s++) {
      const d = pickDistractors(cat, pool, 'ru_en', mulberry32(s));
      const hasBig = d.filter((w) => [big.id, large.id, huge.id].includes(w.id)).length;
      expect(hasBig).toBeLessThanOrEqual(1);
    }
  });

  it('prefers words that share a tag', () => {
    const a = word('apple', ['яблоко'], { tagIds: ['food'] });
    const b = word('bread', ['хлеб'], { tagIds: ['food'] });
    const c = word('milk', ['молоко'], { tagIds: ['food'] });
    const d = word('cheese', ['сыр'], { tagIds: ['food'] });
    for (let s = 0; s < 30; s++) {
      const res = pickDistractors(a, [a, b, c, d, cat, dog, house, run, tree], 'en_ru', mulberry32(s));
      expect(res.map((w) => w.id).sort()).toEqual([b.id, c.id, d.id].sort());
    }
  });

  it('works with small libraries (returns what is available)', () => {
    expect(pickDistractors(cat, [cat], 'en_ru')).toEqual([]);
    expect(pickDistractors(cat, [cat, dog], 'en_ru')).toHaveLength(1);
    expect(pickDistractors(big, [big, large, huge], 'en_ru')).toHaveLength(0);
  });

  it('skips duplicate option texts', () => {
    const dog2 = word('Dog', ['пёс']); // same term text as dog when ru_en
    const d = pickDistractors(cat, [cat, dog, dog2], 'ru_en', mulberry32(2));
    expect(d).toHaveLength(1);
  });
});

describe('buildOptions', () => {
  it('contains exactly one correct option and shuffles it', () => {
    const positions = new Set<number>();
    for (let s = 0; s < 40; s++) {
      const opts = buildOptions(cat, pool, 'en_ru', mulberry32(s));
      expect(opts).toHaveLength(4);
      expect(opts.filter((o) => o.correct)).toHaveLength(1);
      positions.add(opts.findIndex((o) => o.correct));
    }
    expect(positions.size).toBeGreaterThan(2);
  });

  it('uses translations for EN→RU and terms for RU→EN', () => {
    expect(optionText(cat, 'en_ru')).toBe('кот, кошка');
    expect(optionText(cat, 'ru_en')).toBe('cat');
  });
});
