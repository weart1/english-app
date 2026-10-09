import { describe, expect, it } from 'vitest';
import { answerVariants, checkAnswer, diffAnswer, levenshtein, normalizeAnswer, typoTolerance } from '@/lib/answerCheck';

describe('normalizeAnswer', () => {
  it('trims, lowercases and collapses spaces', () => {
    expect(normalizeAnswer('  Give   UP  ')).toBe('give up');
  });
  it('strips surrounding punctuation but keeps inner', () => {
    expect(normalizeAnswer('"apple!"')).toBe('apple');
    expect(normalizeAnswer('...well-known.')).toBe('well-known');
    expect(normalizeAnswer("«don't»")).toBe("don't");
  });
  it('unifies apostrophes', () => {
    expect(normalizeAnswer('don’t')).toBe("don't");
    expect(normalizeAnswer('don`t')).toBe("don't");
  });
  it('treats ё as е', () => {
    expect(normalizeAnswer('Ёлка')).toBe('елка');
  });
});

describe('answerVariants', () => {
  it('drops "to" and articles for English only', () => {
    expect(answerVariants('to run', 'en')).toEqual(expect.arrayContaining(['to run', 'run']));
    expect(answerVariants('an apple', 'en')).toEqual(expect.arrayContaining(['an apple', 'apple']));
    expect(answerVariants('the end', 'en')).toContain('end');
    expect(answerVariants('то есть', 'ru')).toEqual(['то есть']);
  });
  it('accepts the answer without a parenthetical note', () => {
    expect(answerVariants('бежать (быстро)', 'ru')).toEqual(expect.arrayContaining(['бежать (быстро)', 'бежать']));
  });
});

describe('checkAnswer', () => {
  it('accepts any of several translations', () => {
    expect(checkAnswer('бросать', ['сдаваться', 'бросать'], 'ru')).toMatchObject({ verdict: 'correct', expected: 'бросать' });
  });

  it('accepts several correct translations separated by commas', () => {
    expect(checkAnswer('кот, кошка', ['кот', 'кошка'], 'ru').verdict).toBe('correct');
    expect(checkAnswer('кот, собака', ['кот', 'кошка'], 'ru').verdict).toBe('wrong');
  });

  it('ё/е and case-insensitive', () => {
    expect(checkAnswer('ЕЛКА', ['ёлка'], 'ru').verdict).toBe('correct');
    expect(checkAnswer('ёлка', ['елка'], 'ru').verdict).toBe('correct');
  });

  it('apostrophes', () => {
    expect(checkAnswer('dont', ["don't"], 'en').verdict).toBe('typo');
    expect(checkAnswer('don’t', ["don't"], 'en').verdict).toBe('correct');
  });

  it('tolerates "to" for verbs and articles for nouns, in both directions', () => {
    expect(checkAnswer('to give up', ['give up'], 'en').verdict).toBe('correct');
    expect(checkAnswer('give up', ['to give up'], 'en').verdict).toBe('correct');
    expect(checkAnswer('an apple', ['apple'], 'en').verdict).toBe('correct');
    expect(checkAnswer('apple', ['the apple'], 'en').verdict).toBe('correct');
    expect(checkAnswer('the run', ['to run'], 'en').verdict).toBe('correct');
  });

  it('phrases and hyphens', () => {
    expect(checkAnswer('well known', ['well-known'], 'en').verdict).toBe('typo');
    expect(checkAnswer('Well-Known', ['well-known'], 'en').verdict).toBe('correct');
  });

  it('Levenshtein ≤ 1 for 4–7 characters is a typo (graded Hard)', () => {
    expect(checkAnswer('aple', ['apple'], 'en')).toMatchObject({ verdict: 'typo', distance: 1 });
    expect(checkAnswer('appl', ['apple'], 'en').verdict).toBe('typo');
    expect(checkAnswer('aplle', ['apple'], 'en').verdict).toBe('typo');
    expect(checkAnswer('apl', ['apple'], 'en').verdict).toBe('wrong'); // distance 2
  });

  it('Levenshtein ≤ 2 for 8+ characters', () => {
    expect(checkAnswer('serendipty', ['serendipity'], 'en').verdict).toBe('typo');
    expect(checkAnswer('serendepty', ['serendipity'], 'en').verdict).toBe('typo');
    expect(checkAnswer('sarendepty', ['serendipity'], 'en').verdict).toBe('wrong');
  });

  it('no tolerance under 4 characters', () => {
    expect(checkAnswer('cot', ['cat'], 'en').verdict).toBe('wrong');
    expect(checkAnswer('кит', ['кот'], 'ru').verdict).toBe('wrong');
  });

  it('rejects clearly wrong and empty answers', () => {
    expect(checkAnswer('banana', ['apple'], 'en').verdict).toBe('wrong');
    expect(checkAnswer('', ['apple'], 'en').verdict).toBe('wrong');
    expect(checkAnswer('   ', ['apple'], 'en').verdict).toBe('wrong');
    expect(checkAnswer('!!!', ['apple'], 'en').verdict).toBe('wrong');
  });

  it('reports the closest expected answer', () => {
    expect(checkAnswer('сдаватся', ['бросать', 'сдаваться'], 'ru')).toMatchObject({ verdict: 'typo', expected: 'сдаваться' });
  });
});

describe('levenshtein / tolerance', () => {
  it('computes distances', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', 'abc')).toBe(0);
  });
  it('thresholds', () => {
    expect(typoTolerance(3)).toBe(0);
    expect(typoTolerance(4)).toBe(1);
    expect(typoTolerance(7)).toBe(1);
    expect(typoTolerance(8)).toBe(2);
  });
});

describe('diffAnswer', () => {
  it('marks missing and wrong letters', () => {
    const d = diffAnswer('aple', 'apple');
    expect(d.expected.map((s) => s.text).join('')).toBe('apple');
    expect(d.expected.filter((s) => !s.ok).map((s) => s.text).join('')).toBe('p');
    expect(d.input.every((s) => s.ok)).toBe(true);
  });
  it('marks extra letters in the input', () => {
    const d = diffAnswer('appple', 'apple');
    expect(d.input.filter((s) => !s.ok).map((s) => s.text).join('')).toBe('p');
  });
  it('is case and ё insensitive', () => {
    const d = diffAnswer('Елка', 'ёлка');
    expect(d.expected.every((s) => s.ok)).toBe(true);
  });
});
