import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/schema';
import {
  addWord,
  clearAllData,
  createTag,
  deleteTag,
  deleteWords,
  findDuplicate,
  getSettings,
  recordAnswers,
  restoreDeleted,
  setArchived,
  toggleTagOnWords,
  updateSettings,
  updateWord,
} from '@/db/repo';
import { UserFacingError } from '@/lib/errors';

beforeEach(async () => {
  await clearAllData();
});

const NOW = new Date(2026, 5, 10, 12);

describe('repo: words', () => {
  it('addWord creates the word and both cards', async () => {
    const w = await addWord({ term: '  Give   up ', translations: ['сдаваться', ' бросать ', 'сдаваться'] }, NOW);
    expect(w.term).toBe('Give up');
    expect(w.translations).toEqual(['сдаваться', 'бросать']);
    const cards = await db.cards.where('wordId').equals(w.id).toArray();
    expect(cards.map((c) => c.direction).sort()).toEqual(['en_ru', 'ru_en']);
    expect(cards.every((c) => c.state === 'new' && c.easeFactor === 2.5)).toBe(true);
  });

  it('rejects empty term or translations with a Russian message', async () => {
    await expect(addWord({ term: ' ', translations: ['x'] })).rejects.toBeInstanceOf(UserFacingError);
    await expect(addWord({ term: 'cat', translations: [' '] })).rejects.toThrow('Добавьте хотя бы один перевод');
    expect(await db.words.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);
  });

  it('findDuplicate compares normalized terms', async () => {
    const w = await addWord({ term: 'Well-known', translations: ['известный'] });
    expect((await findDuplicate('  well-KNOWN '))?.id).toBe(w.id);
    expect(await findDuplicate('well known')).toBeUndefined();
    expect(await findDuplicate('well-known', w.id)).toBeUndefined();
    await addWord({ term: 'give  up', translations: ['сдаться'] });
    expect(await findDuplicate('Give Up')).toBeDefined();
  });

  it('updateWord clears optional fields', async () => {
    const w = await addWord({ term: 'cat', translations: ['кот'], transcription: '/kæt/', note: 'n' });
    const u = await updateWord(w.id, { term: 'cat', translations: ['кошка'], transcription: '', note: '' });
    expect(u.transcription).toBeUndefined();
    expect(u.note).toBeUndefined();
    expect((await db.words.get(w.id))?.translations).toEqual(['кошка']);
  });

  it('deleteWords removes cards and logs; restoreDeleted brings them back', async () => {
    const w = await addWord({ term: 'dog', translations: ['собака'] }, NOW);
    const keep = await addWord({ term: 'cat', translations: ['кот'] }, NOW);
    await recordAnswers(
      [{ cardId: `${w.id}:en_ru`, grade: 2, wasCorrect: true, mode: 'typing', responseMs: 1000 }],
      { practiceOnly: false, now: NOW, dayStartsAtHour: 4 },
    );
    const snap = await deleteWords([w.id]);
    expect(snap.words).toHaveLength(1);
    expect(snap.cards).toHaveLength(2);
    expect(snap.logs).toHaveLength(1);
    expect(await db.cards.where('wordId').equals(w.id).count()).toBe(0);
    expect(await db.logs.where('wordId').equals(w.id).count()).toBe(0);
    expect(await db.cards.where('wordId').equals(keep.id).count()).toBe(2);
    await restoreDeleted(snap);
    expect(await db.words.get(w.id)).toBeDefined();
    expect(await db.cards.where('wordId').equals(w.id).count()).toBe(2);
    expect(await db.logs.count()).toBe(1);
  });

  it('setArchived toggles the flag', async () => {
    const w = await addWord({ term: 'dog', translations: ['собака'] });
    await setArchived([w.id], true);
    expect((await db.words.get(w.id))?.archived).toBe(true);
    await setArchived([w.id], false);
    expect((await db.words.get(w.id))?.archived).toBe(false);
  });
});

describe('repo: answers', () => {
  it('updates the card and writes a log in one go', async () => {
    const w = await addWord({ term: 'dog', translations: ['собака'] }, NOW);
    await recordAnswers(
      [{ cardId: `${w.id}:ru_en`, grade: 3, wasCorrect: true, mode: 'flashcards', responseMs: 1200 }],
      { practiceOnly: false, now: NOW, dayStartsAtHour: 4 },
    );
    const card = await db.cards.get(`${w.id}:ru_en`);
    expect(card?.state).toBe('review');
    expect(card?.intervalDays).toBe(4);
    expect(card?.correctCount).toBe(1);
    const logs = await db.logs.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.grade).toBe(3);
  });

  it('practice-only logs the answer but leaves the card untouched', async () => {
    const w = await addWord({ term: 'dog', translations: ['собака'] }, NOW);
    const before = await db.cards.get(`${w.id}:en_ru`);
    await recordAnswers(
      [{ cardId: `${w.id}:en_ru`, grade: 0, wasCorrect: false, mode: 'typing', responseMs: 1200 }],
      { practiceOnly: true, now: NOW, dayStartsAtHour: 4 },
    );
    expect(await db.cards.get(`${w.id}:en_ru`)).toEqual(before);
    const logs = await db.logs.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.practice).toBe(true);
  });

  it('skips answers for deleted cards without writing orphan logs', async () => {
    await recordAnswers(
      [{ cardId: 'missing:en_ru', grade: 2, wasCorrect: true, mode: 'typing', responseMs: 1 }],
      { practiceOnly: false, now: NOW, dayStartsAtHour: 4 },
    );
    expect(await db.logs.count()).toBe(0);
  });
});

describe('repo: tags and settings', () => {
  it('createTag dedupes by name; toggle adds then removes; deleteTag strips words', async () => {
    const a = await addWord({ term: 'a1', translations: ['а'] });
    const b = await addWord({ term: 'b1', translations: ['б'] });
    const t = await createTag('Travel');
    expect((await createTag(' travel ')).id).toBe(t.id);
    expect(await toggleTagOnWords(t.id, [a.id, b.id])).toBe('added');
    expect((await db.words.get(a.id))?.tagIds).toEqual([t.id]);
    expect(await toggleTagOnWords(t.id, [a.id, b.id])).toBe('removed');
    await toggleTagOnWords(t.id, [a.id]);
    await deleteTag(t.id);
    expect((await db.words.get(a.id))?.tagIds).toEqual([]);
    expect(await db.tags.count()).toBe(0);
  });

  it('settings fall back to defaults and merge patches', async () => {
    expect((await getSettings()).dailyGoal).toBe(10);
    await updateSettings({ dailyGoal: 25 });
    const s = await getSettings();
    expect(s.dailyGoal).toBe(25);
    expect(s.dayStartsAtHour).toBe(4);
  });
});
