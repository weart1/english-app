import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { filterBank, libraryTermSet, pickDaily } from '@/lib/dailyWords';
import { getBank } from '@/data/wordbank';
import { addBankItems } from '@/app/bankActions';
import { appendDailyPick, clearAllData, ensureDailyPick, markBankKnown } from '@/db/repo';
import { db } from '@/db/schema';
import { WordFlowDB } from '@/db/schema';

const bank = getBank();

describe('filterBank', () => {
  it('filters by level, topic and kind', () => {
    const f = filterBank(bank, { levels: ['A1'], topics: ['food'], kind: 'words' });
    expect(f.length).toBeGreaterThan(10);
    expect(f.every((i) => i.level === 'A1' && i.topic === 'food' && i.kind === 'word')).toBe(true);
    const phrases = filterBank(bank, { levels: [], topics: [], kind: 'phrases' });
    expect(phrases.every((i) => i.kind === 'phrase')).toBe(true);
    expect(phrases.length).toBeGreaterThanOrEqual(1000);
  });
});

describe('pickDaily', () => {
  const pool = filterBank(bank, { levels: ['A2', 'B1'], topics: [], kind: 'both' });

  it('is deterministic for a day and differs between days', () => {
    const opts = { count: 5, exclude: new Set<string>(), libraryTerms: new Set<string>() };
    const a = pickDaily(pool, { ...opts, seed: '2026-10-09' });
    expect(a).toEqual(pickDaily(pool, { ...opts, seed: '2026-10-09' }));
    expect(a).not.toEqual(pickDaily(pool, { ...opts, seed: '2026-10-10' }));
    expect(new Set(a).size).toBe(5);
  });

  it('mixes words and phrases and skips known / library items', () => {
    const first = pickDaily(pool, { count: 6, seed: 'x', exclude: new Set(), libraryTerms: new Set() });
    const items = first.map((id) => bank.find((b) => b.id === id)!);
    expect(items.some((i) => i.kind === 'phrase')).toBe(true);
    expect(items.some((i) => i.kind === 'word')).toBe(true);
    const lib = libraryTermSet([{ term: items[0]!.term.toUpperCase() }]);
    const again = pickDaily(pool, { count: 6, seed: 'x', exclude: new Set([items[1]!.id]), libraryTerms: lib });
    expect(again).not.toContain(items[0]!.id);
    expect(again).not.toContain(items[1]!.id);
  });

  it('returns fewer items when the pool is exhausted', () => {
    const tiny = pool.slice(0, 2);
    expect(pickDaily(tiny, { count: 5, seed: 's', exclude: new Set(), libraryTerms: new Set() })).toHaveLength(2);
  });
});

describe('daily pick storage and adding to the library', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('keeps one pick per day and appends more', async () => {
    let calls = 0;
    const make = () => {
      calls++;
      return ['w:apple', 'w:river'];
    };
    expect(await ensureDailyPick('2026-10-09', make)).toEqual(['w:apple', 'w:river']);
    expect(await ensureDailyPick('2026-10-09', make)).toEqual(['w:apple', 'w:river']);
    expect(calls).toBe(1);
    await appendDailyPick('2026-10-09', ['w:river', 'w:sun']);
    expect((await db.daily.get('2026-10-09'))?.itemIds).toEqual(['w:apple', 'w:river', 'w:sun']);
  });

  it('adds items with cards, topic tag and level note; skips duplicates', async () => {
    const items = bank.filter((i) => i.topic === 'food').slice(0, 3);
    expect(await addBankItems(items)).toBe(3);
    expect(await addBankItems(items)).toBe(0);
    expect(await db.words.count()).toBe(3);
    expect(await db.cards.count()).toBe(6);
    const tag = await db.tags.toArray();
    expect(tag.map((t) => t.name)).toEqual(['Еда и напитки']);
    const w = await db.words.toArray();
    expect(w[0]?.note).toMatch(/^Уровень (A1|A2|B1|B2|C1)/);
  });

  it('known marks survive in the table', async () => {
    await markBankKnown(['w:apple']);
    expect((await db.bankMarks.get('w:apple'))?.status).toBe('known');
  });
});

describe('schema migration v1 → v2', () => {
  it('keeps existing data and adds the new tables', async () => {
    const name = 'wordflow-migration-test';
    await Dexie.delete(name);
    const v1 = new Dexie(name);
    v1.version(1).stores({
      words: 'id, term, createdAt, updatedAt, *tagIds',
      cards: 'id, wordId, direction, dueAt, state',
      logs: 'id, wordId, cardId, reviewedAt',
      tags: 'id, name',
      presets: 'id, createdAt',
      settings: 'id',
      sessions: 'id',
    });
    await v1.table('words').add({ id: 'w1', term: 'cat', translations: ['кот'], examples: [], tagIds: [], createdAt: 'x', updatedAt: 'x', archived: false });
    await v1.table('settings').put({ id: 'settings', dailyGoal: 15, schemaVersion: 1 });
    v1.close();

    const v2 = new WordFlowDB(name);
    await v2.open();
    expect(v2.verno).toBe(2);
    expect((await v2.words.get('w1'))?.term).toBe('cat');
    const s = await v2.settings.get('settings');
    expect(s?.dailyGoal).toBe(15);
    expect(s?.schemaVersion).toBe(2);
    expect(await v2.bankMarks.count()).toBe(0);
    expect(await v2.daily.count()).toBe(0);
    v2.close();
    await Dexie.delete(name);
  });
});
