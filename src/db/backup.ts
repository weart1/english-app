/**
 * JSON backup / restore. A file is validated completely (zod + referential
 * checks) before the database is touched, and a restore runs in one
 * transaction: on any error nothing changes.
 */
import { z } from 'zod';
import { db, DEFAULT_SETTINGS } from './schema';
import { DB_SCHEMA_VERSION } from './migrations';
import { makeCard } from './repo';
import type { ReviewCard, ReviewLog, SessionPreset, Settings, Tag, Word } from './types';
import { DIRECTIONS } from './types';
import { localDateKey } from '@/lib/dates';

export const BACKUP_APP = 'WordFlow';

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: 'invalid date' });
const nonNeg = z.number().finite().nonnegative();
const nonNegInt = z.number().int().nonnegative();
const modeEnum = z.enum(['flashcards', 'choice', 'typing', 'listening', 'cloze', 'pairs', 'mixed']);
const directionEnum = z.enum(['en_ru', 'ru_en']);

const wordSchema = z.object({
  id: z.string().min(1),
  term: z.string().trim().min(1),
  translations: z.array(z.string()).min(1),
  transcription: z.string().optional(),
  examples: z.array(z.string()),
  note: z.string().optional(),
  tagIds: z.array(z.string()),
  createdAt: isoDate,
  updatedAt: isoDate,
  archived: z.boolean(),
});

const cardSchema = z.object({
  id: z.string().min(1),
  wordId: z.string().min(1),
  direction: directionEnum,
  state: z.enum(['new', 'learning', 'review', 'relearning']),
  easeFactor: z.number().finite().min(1).max(5),
  intervalDays: nonNeg,
  repetitions: nonNegInt,
  lapses: nonNegInt,
  dueAt: isoDate,
  lastReviewedAt: isoDate.optional(),
  correctCount: nonNegInt,
  wrongCount: nonNegInt,
});

const tagSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  color: z.string().min(1),
  createdAt: isoDate,
});

const logSchema = z.object({
  id: z.string().min(1),
  cardId: z.string().min(1),
  wordId: z.string().min(1),
  mode: modeEnum,
  grade: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  wasCorrect: z.boolean(),
  responseMs: nonNeg,
  reviewedAt: isoDate,
  practice: z.boolean().optional(),
});

const presetSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  selection: z.object({
    source: z.enum(['selected', 'tag', 'all', 'hard', 'due', 'new']),
    wordIds: z.array(z.string()).optional(),
    tagId: z.string().optional(),
    count: z.union([nonNegInt, z.literal('all')]),
    order: z.enum(['random', 'ordered']),
  }),
  mode: modeEnum,
  directions: z.array(directionEnum).min(1),
  createdAt: isoDate,
  practiceOnly: z.boolean().optional(),
  autoPlay: z.boolean().optional(),
});

const settingsSchema = z.object({
  id: z.literal('settings'),
  dailyGoal: z.number().int().min(1).max(1000),
  newWordsPerDay: z.number().int().min(0).max(1000),
  ttsVoiceURI: z.string().optional(),
  ttsRate: z.number().min(0.3).max(2),
  autoPlayAudio: z.boolean(),
  dayStartsAtHour: z.number().int().min(0).max(23),
  lastBackupAt: isoDate.optional(),
  schemaVersion: z.number().int().positive(),
});

export const backupSchema = z.object({
  app: z.literal(BACKUP_APP),
  schemaVersion: z.number().int().positive(),
  exportedAt: isoDate,
  words: z.array(wordSchema),
  cards: z.array(cardSchema),
  tags: z.array(tagSchema),
  logs: z.array(logSchema),
  presets: z.array(presetSchema),
  settings: settingsSchema.nullable(),
});

export interface Backup {
  app: typeof BACKUP_APP;
  schemaVersion: number;
  exportedAt: string;
  words: Word[];
  cards: ReviewCard[];
  tags: Tag[];
  logs: ReviewLog[];
  presets: SessionPreset[];
  settings: Settings | null;
}

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Snapshot of all user data (read in one transaction for consistency). */
export async function createBackup(now = new Date()): Promise<Backup> {
  return db.transaction('r', [db.words, db.cards, db.tags, db.logs, db.presets, db.settings], async () => {
    const [words, cards, tags, logs, presets, settings] = await Promise.all([
      db.words.toArray(),
      db.cards.toArray(),
      db.tags.toArray(),
      db.logs.toArray(),
      db.presets.toArray(),
      db.settings.get('settings'),
    ]);
    return {
      app: BACKUP_APP,
      schemaVersion: DB_SCHEMA_VERSION,
      exportedAt: now.toISOString(),
      words: words.sort(byId),
      cards: cards.sort(byId),
      tags: tags.sort(byId),
      logs: logs.sort(byId),
      presets: presets.sort(byId),
      // Always export the effective settings so a restore reproduces them exactly.
      settings: { ...DEFAULT_SETTINGS, ...settings, id: 'settings' },
    };
  });
}

export function backupFileName(now = new Date()): string {
  return `wordflow-backup-${localDateKey(now)}.json`;
}

export type ParseError = 'invalid' | 'newer';

/** Validates a backup file. Self-heals harmless gaps (orphan cards/logs, missing cards). */
export function parseBackup(text: string): { ok: true; backup: Backup } | { ok: false; error: ParseError } {
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return { ok: false, error: 'invalid' };
  }
  if (json && typeof json === 'object' && 'schemaVersion' in json) {
    const v = (json as { schemaVersion: unknown }).schemaVersion;
    if (typeof v === 'number' && v > DB_SCHEMA_VERSION) return { ok: false, error: 'newer' };
  }
  const parsed = backupSchema.safeParse(json);
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const data = parsed.data as Backup;

  // Duplicate ids mean a corrupted file.
  for (const list of [data.words, data.cards, data.tags, data.logs, data.presets] as { id: string }[][]) {
    if (new Set(list.map((x) => x.id)).size !== list.length) return { ok: false, error: 'invalid' };
  }
  const wordIds = new Set(data.words.map((w) => w.id));
  const cards = data.cards.filter((c) => wordIds.has(c.wordId) && c.id === `${c.wordId}:${c.direction}`);
  const cardIds = new Set(cards.map((c) => c.id));
  const exportedAt = new Date(data.exportedAt);
  for (const w of data.words) {
    for (const d of DIRECTIONS) {
      if (!cardIds.has(`${w.id}:${d}`)) cards.push(makeCard(w.id, d, exportedAt));
    }
  }
  const tagIds = new Set(data.tags.map((t) => t.id));
  const words = data.words.map((w) => ({ ...w, tagIds: w.tagIds.filter((t) => tagIds.has(t)) }));
  const logs = data.logs.filter((l) => wordIds.has(l.wordId));
  return { ok: true, backup: { ...data, words, cards: cards.sort(byId), logs } };
}

export type RestoreMode = 'replace' | 'merge';

export interface RestorePlan {
  mode: RestoreMode;
  currentWords: number;
  incomingWords: number;
  added: number;
  updated: number;
  unchanged: number;
}

export async function planRestore(backup: Backup, mode: RestoreMode): Promise<RestorePlan> {
  const current = await db.words.toArray();
  const map = new Map(current.map((w) => [w.id, w]));
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const w of backup.words) {
    const cur = map.get(w.id);
    if (!cur) added++;
    else if (w.updatedAt > cur.updatedAt) updated++;
    else unchanged++;
  }
  return { mode, currentWords: current.length, incomingWords: backup.words.length, added, updated, unchanged };
}

/** Applies a validated backup in a single transaction. */
export async function applyRestore(backup: Backup, mode: RestoreMode): Promise<void> {
  await db.transaction('rw', [db.words, db.cards, db.tags, db.logs, db.presets, db.settings, db.sessions], async () => {
    if (mode === 'replace') {
      await Promise.all([
        db.words.clear(),
        db.cards.clear(),
        db.tags.clear(),
        db.logs.clear(),
        db.presets.clear(),
        db.settings.clear(),
        db.sessions.clear(),
      ]);
      await db.words.bulkAdd(backup.words);
      await db.cards.bulkAdd(backup.cards);
      await db.tags.bulkAdd(backup.tags);
      await db.logs.bulkAdd(backup.logs);
      await db.presets.bulkAdd(backup.presets);
      await db.settings.put({ ...DEFAULT_SETTINGS, ...(backup.settings ?? {}), id: 'settings', schemaVersion: DB_SCHEMA_VERSION });
      return;
    }

    // Merge by id; for words keep the newer updatedAt (and that side's cards).
    const currentWords = new Map((await db.words.toArray()).map((w) => [w.id, w]));
    const incomingCards = new Map<string, ReviewCard[]>();
    for (const c of backup.cards) {
      const list = incomingCards.get(c.wordId) ?? [];
      list.push(c);
      incomingCards.set(c.wordId, list);
    }
    const wordsToPut: Word[] = [];
    const cardsToPut: ReviewCard[] = [];
    for (const w of backup.words) {
      const cur = currentWords.get(w.id);
      if (cur && cur.updatedAt >= w.updatedAt) continue;
      wordsToPut.push(w);
      cardsToPut.push(...(incomingCards.get(w.id) ?? []));
    }
    const existingTags = new Set((await db.tags.toArray()).map((t) => t.id));
    const existingPresets = new Set((await db.presets.toArray()).map((p) => p.id));
    await db.tags.bulkPut(backup.tags.filter((t) => !existingTags.has(t.id)));
    await db.words.bulkPut(wordsToPut);
    await db.cards.bulkPut(cardsToPut);
    await db.logs.bulkPut(backup.logs); // logs are immutable: same id = same record
    await db.presets.bulkPut(backup.presets.filter((p) => !existingPresets.has(p.id)));
  });
}
