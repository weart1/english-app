import { beforeEach, describe, expect, it } from 'vitest';
import { applyRestore, backupFileName, createBackup, parseBackup, planRestore } from '@/db/backup';
import { addWord, clearAllData, createTag, recordAnswers, savePreset, updateSettings, updateWord } from '@/db/repo';
import { db } from '@/db/schema';

const NOW = new Date(2026, 5, 10, 12);

async function seed() {
  const tag = await createTag('Travel', '#2F6BFF', NOW);
  const a = await addWord({ term: 'apple', translations: ['яблоко'], examples: ['An apple.'], tagIds: [tag.id], note: 'fruit' }, NOW);
  const b = await addWord({ term: "don't", translations: ['не делать'], transcription: '/dəʊnt/' }, NOW);
  await recordAnswers(
    [
      { cardId: `${a.id}:en_ru`, grade: 2, wasCorrect: true, mode: 'typing', responseMs: 1200 },
      { cardId: `${b.id}:ru_en`, grade: 0, wasCorrect: false, mode: 'choice', responseMs: 900 },
    ],
    { practiceOnly: false, now: NOW, dayStartsAtHour: 4 },
  );
  await savePreset({ name: 'Утро', selection: { source: 'tag', tagId: tag.id, count: 10, order: 'random' }, mode: 'mixed', directions: ['en_ru'] }, NOW);
  await updateSettings({ dailyGoal: 15, ttsRate: 1.1 });
  return { a, b, tag };
}

const strip = (b: Awaited<ReturnType<typeof createBackup>>) => ({ ...b, exportedAt: 'x' });

beforeEach(async () => {
  await clearAllData();
});

describe('backup', () => {
  it('export → wipe → restore (replace) produces identical data', async () => {
    await seed();
    const before = await createBackup(NOW);
    const text = JSON.stringify(before);
    await clearAllData();
    expect(await db.words.count()).toBe(0);
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    await applyRestore(parsed.backup, 'replace');
    const after = await createBackup(NOW);
    expect(strip(after)).toEqual(strip(before));
    expect(before.words).toHaveLength(2);
    expect(before.cards).toHaveLength(4);
    expect(before.logs).toHaveLength(2);
  });

  it('file name follows wordflow-backup-YYYY-MM-DD.json', () => {
    expect(backupFileName(new Date(2026, 0, 5))).toBe('wordflow-backup-2026-01-05.json');
  });

  it('rejects invalid files without touching the database', async () => {
    await seed();
    const snapshot = strip(await createBackup(NOW));
    const good = await createBackup(NOW);
    const bad = [
      'not json',
      '{}',
      JSON.stringify({ ...good, app: 'Other' }),
      JSON.stringify({ ...good, words: [{ ...good.words[0], translations: [] }] }),
      JSON.stringify({ ...good, cards: [{ ...good.cards[0], easeFactor: 'x' }] }),
      JSON.stringify({ ...good, logs: [{ ...good.logs[0], grade: 7 }] }),
      JSON.stringify({ ...good, words: [good.words[0], good.words[0]] }), // duplicate ids
    ];
    for (const text of bad) {
      const r = parseBackup(text);
      expect(r.ok).toBe(false);
    }
    expect(parseBackup(JSON.stringify({ ...good, schemaVersion: 99 }))).toEqual({ ok: false, error: 'newer' });
    expect(strip(await createBackup(NOW))).toEqual(snapshot);
  });

  it('self-heals orphan cards/logs and missing cards', async () => {
    const { a } = await seed();
    const good = await createBackup(NOW);
    const tampered = {
      ...good,
      cards: good.cards.filter((c) => c.id !== `${a.id}:ru_en`).concat([{ ...good.cards[0]!, id: 'ghost:en_ru', wordId: 'ghost' }]),
      logs: good.logs.concat([{ ...good.logs[0]!, id: 'orphan-log', wordId: 'ghost' }]),
    };
    const r = parseBackup(JSON.stringify(tampered));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.backup.cards.map((c) => c.id)).toContain(`${a.id}:ru_en`);
    expect(r.backup.cards.map((c) => c.wordId)).not.toContain('ghost');
    expect(r.backup.logs.map((l) => l.id)).not.toContain('orphan-log');
  });

  it('merge keeps the newer word and adds missing ones', async () => {
    const { a } = await seed();
    const backup = await createBackup(NOW);
    // Local edit after the backup → local wins.
    await updateWord(a.id, { term: 'apple', translations: ['яблоко', 'яблоня'] }, new Date(2026, 5, 11));
    // A brand-new word only in the backup.
    const extra = { ...backup.words[0]!, id: 'extra', term: 'pear', translations: ['груша'] };
    const withExtra = {
      ...backup,
      words: [...backup.words, extra],
      cards: [...backup.cards, { ...backup.cards[0]!, id: 'extra:en_ru', wordId: 'extra' }],
    };
    const parsed = parseBackup(JSON.stringify(withExtra));
    if (!parsed.ok) throw new Error('parse');
    const plan = await planRestore(parsed.backup, 'merge');
    expect(plan).toMatchObject({ added: 1, updated: 0, unchanged: 2 });
    await applyRestore(parsed.backup, 'merge');
    expect((await db.words.get(a.id))?.translations).toEqual(['яблоко', 'яблоня']);
    expect(await db.words.get('extra')).toBeDefined();
    expect(await db.cards.where('wordId').equals('extra').count()).toBe(2); // missing card self-healed
    expect((await db.settings.get('settings'))?.dailyGoal).toBe(15);
  });

  it('a failing restore changes nothing (transaction rollback)', async () => {
    await seed();
    const snapshot = strip(await createBackup(NOW));
    const good = await createBackup(NOW);
    // Same id twice across tables passes zod but makes bulkAdd throw inside the transaction.
    const parsed = parseBackup(JSON.stringify(good));
    if (!parsed.ok) throw new Error('parse');
    const broken = { ...parsed.backup, logs: [...parsed.backup.logs, parsed.backup.logs[0]!] };
    await expect(applyRestore(broken, 'replace')).rejects.toThrow();
    expect(strip(await createBackup(NOW))).toEqual(snapshot);
  });
});
