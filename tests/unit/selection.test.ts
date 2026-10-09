import { describe, expect, it } from 'vitest';
import { resolveSelection, sessionCards, sourceWordIds } from '@/lib/selection';
import { planSession } from '@/lib/sessionPlan';
import { mulberry32 } from '@/lib/random';
import type { ReviewCard, SessionConfig } from '@/db/types';
import { cardsFor, word } from './helpers';

const NOW = new Date(2026, 5, 10, 12);
const words = Array.from({ length: 20 }, (_, i) => word(`w${i}`, [`п${i}`]));
const archived = word('old', ['старый'], { archived: true });
const all = [...words, archived];
const cards: ReviewCard[] = all.flatMap((w) => cardsFor(w));
const ctx = { words: all, cards, now: NOW, dayStartsAtHour: 4, rng: mulberry32(1) };

describe('resolveSelection', () => {
  it('random N picks exactly N distinct words', () => {
    for (let s = 0; s < 20; s++) {
      const r = resolveSelection({ source: 'all', count: 5, order: 'random' }, { ...ctx, rng: mulberry32(s) });
      expect(r.wordIds).toHaveLength(5);
      expect(new Set(r.wordIds).size).toBe(5);
      expect(r.available).toBe(20);
    }
  });

  it('uses all words when the source has fewer than requested', () => {
    const r = resolveSelection({ source: 'selected', wordIds: [words[0]!.id, words[1]!.id], count: 10, order: 'ordered' }, ctx);
    expect(r.wordIds).toEqual([words[0]!.id, words[1]!.id]);
    expect(r.available).toBe(2);
  });

  it('skips deleted ids in an explicit selection', () => {
    const r = resolveSelection({ source: 'selected', wordIds: ['gone', words[3]!.id], count: 'all', order: 'ordered' }, ctx);
    expect(r.wordIds).toEqual([words[3]!.id]);
  });

  it('excludes archived words from automatic sources but not from explicit selection', () => {
    expect(sourceWordIds({ source: 'all', count: 'all', order: 'ordered' }, ctx)).not.toContain(archived.id);
    expect(sourceWordIds({ source: 'selected', wordIds: [archived.id], count: 'all', order: 'ordered' }, ctx)).toEqual([
      archived.id,
    ]);
  });

  it('due / new / hard / tag sources', () => {
    const dueWord = word('due', ['срок'], { tagIds: ['t1'] });
    const dueCards = cardsFor(dueWord, { state: 'review', intervalDays: 3, dueAt: new Date(2026, 5, 9).toISOString() });
    const hardWord = word('hard', ['трудный']);
    const hardCards = cardsFor(hardWord, { state: 'review', lapses: 1, wrongCount: 2, dueAt: new Date(2026, 6, 1).toISOString() });
    const c2 = { words: [dueWord, hardWord, words[0]!], cards: [...dueCards, ...hardCards, ...cardsFor(words[0]!)], now: NOW, dayStartsAtHour: 4 };
    expect(sourceWordIds({ source: 'due', count: 'all', order: 'ordered' }, c2)).toEqual([dueWord.id]);
    expect(sourceWordIds({ source: 'new', count: 'all', order: 'ordered' }, c2)).toEqual([words[0]!.id]);
    expect(sourceWordIds({ source: 'hard', count: 'all', order: 'ordered' }, c2)).toEqual([hardWord.id]);
    expect(sourceWordIds({ source: 'tag', tagId: 't1', count: 'all', order: 'ordered' }, c2)).toEqual([dueWord.id]);
  });
});

describe('sessionCards', () => {
  it('returns word × direction cards, direction-major', () => {
    const ids = [words[0]!.id, words[1]!.id];
    const c = sessionCards(ids, ['en_ru', 'ru_en'], { source: 'all' }, ctx);
    expect(c.map((x) => x.id)).toEqual([`${ids[0]}:en_ru`, `${ids[1]}:en_ru`, `${ids[0]}:ru_en`, `${ids[1]}:ru_en`]);
    expect(sessionCards(ids, ['ru_en'], { source: 'all' }, ctx)).toHaveLength(2);
  });
});

describe('planSession', () => {
  const base = (patch: Partial<SessionConfig>): SessionConfig => ({
    mode: 'typing',
    directions: ['en_ru', 'ru_en'],
    practiceOnly: false,
    autoPlay: false,
    sourceLabel: 'x',
    criteria: { source: 'all', count: 'all', order: 'ordered' },
    ...patch,
  });

  it('builds seeds for every card', () => {
    const plan = planSession({ config: base({}), selection: ctx, modes: { allWords: all, ttsSupported: false } });
    expect(plan.seeds).toHaveLength(40);
    expect(plan.modeOk).toBe(true);
  });

  it('cloze keeps only words with a matching example', () => {
    const a = word('apple', ['яблоко'], { examples: ['I ate an apple.'] });
    const b = word('pear', ['груша'], { examples: ['No fruit here.'] });
    const c3 = { words: [a, b], cards: [...cardsFor(a), ...cardsFor(b)], now: NOW, dayStartsAtHour: 4, rng: mulberry32(1) };
    const plan = planSession({ config: base({ mode: 'cloze' }), selection: c3, modes: { allWords: [a, b], ttsSupported: true } });
    expect(plan.trainedWordIds).toEqual([a.id]);
    expect(plan.skippedForMode).toBe(1);
    expect(plan.seeds.every((s) => s.mode === 'cloze')).toBe(true);
  });

  it('flags modes that cannot work', () => {
    const tiny = { words: words.slice(0, 3), cards: words.slice(0, 3).flatMap((w) => cardsFor(w)), now: NOW, dayStartsAtHour: 4, rng: mulberry32(1) };
    const choice = planSession({ config: base({ mode: 'choice' }), selection: tiny, modes: { allWords: tiny.words, ttsSupported: true } });
    expect(choice.modeOk).toBe(false);
    expect(choice.modeReason).toContain('4 слов');
    const listening = planSession({ config: base({ mode: 'listening' }), selection: tiny, modes: { allWords: tiny.words, ttsSupported: false } });
    expect(listening.modeOk).toBe(false);
  });

  it('mixed mode never picks an ineligible mode', () => {
    const plan = planSession({
      config: base({ mode: 'mixed' }),
      selection: { ...ctx, cards: cards.map((c) => ({ ...c, state: 'review' as const, intervalDays: 5 })) },
      modes: { allWords: all, ttsSupported: false },
    });
    // No TTS and no examples → review cards can only be typed.
    expect(plan.seeds.every((s) => s.mode === 'typing')).toBe(true);
  });
});
