/**
 * Repository: the only place that writes to IndexedDB.
 * Every multi-step write is a single Dexie transaction, so a failure never
 * leaves partial data (e.g. a word without cards, or a log without its card update).
 */
import { db, DEFAULT_SETTINGS } from './schema';
import type {
  ConcreteMode,
  Direction,
  Grade,
  PersistedSession,
  ReviewCard,
  ReviewLog,
  SessionPreset,
  Settings,
  Tag,
  Word,
} from './types';
import { DIRECTIONS } from './types';
import { newCardFields, scheduler } from '@/lib/srs';
import { hashString, uuid } from '@/lib/random';
import { cleanLine, cleanList, normalizeTerm } from '@/lib/normalize';
import { UserFacingError } from '@/lib/errors';
import { requestPersistentStorage } from '@/lib/storage';
import { ru } from '@/i18n/ru';

export const MAX_TERM_LENGTH = 200;

export function cardId(wordId: string, direction: Direction): string {
  return `${wordId}:${direction}`;
}

export function makeCard(wordId: string, direction: Direction, now: Date): ReviewCard {
  return {
    id: cardId(wordId, direction),
    wordId,
    direction,
    ...newCardFields(now),
    correctCount: 0,
    wrongCount: 0,
  };
}

/* ---------- Settings ---------- */

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('settings');
  return { ...DEFAULT_SETTINGS, ...s, id: 'settings' };
}

export async function updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const current = await getSettings();
    await db.settings.put({ ...current, ...patch, id: 'settings' });
  });
}

/* ---------- Words ---------- */

export interface WordInput {
  term: string;
  translations: string[];
  transcription?: string;
  examples?: string[];
  note?: string;
  tagIds?: string[];
}

/** Validates and cleans user input; throws a UserFacingError (Russian) when invalid. */
export function sanitizeWordInput(input: WordInput): Required<Pick<WordInput, 'term' | 'translations' | 'examples' | 'tagIds'>> &
  Pick<WordInput, 'transcription' | 'note'> {
  const term = cleanLine(input.term);
  if (!term) throw new UserFacingError(ru.editor.errTerm);
  if (term.length > MAX_TERM_LENGTH) throw new UserFacingError(ru.editor.errTermLong);
  const translations = cleanList(input.translations);
  if (translations.length === 0) throw new UserFacingError(ru.editor.errTranslations);
  const transcription = cleanLine(input.transcription ?? '') || undefined;
  const note = (input.note ?? '').trim() || undefined;
  return {
    term,
    translations,
    transcription,
    examples: cleanList(input.examples ?? []),
    note,
    tagIds: Array.from(new Set(input.tagIds ?? [])),
  };
}

/** Finds an existing word whose normalized term matches (case/space-insensitive). */
export async function findDuplicate(term: string, excludeId?: string): Promise<Word | undefined> {
  const key = normalizeTerm(term);
  if (!key) return undefined;
  // Fast path: exact index hit on the trimmed term, then a full normalized scan.
  const exact = await db.words.where('term').equalsIgnoreCase(cleanLine(term)).toArray();
  const hit = exact.find((w) => w.id !== excludeId && normalizeTerm(w.term) === key);
  if (hit) return hit;
  return db.words.filter((w) => w.id !== excludeId && normalizeTerm(w.term) === key).first();
}

/** Creates a word and both of its review cards in one transaction. */
export async function addWord(input: WordInput, now = new Date()): Promise<Word> {
  const clean = sanitizeWordInput(input);
  const iso = now.toISOString();
  const word: Word = {
    id: uuid(),
    ...clean,
    createdAt: iso,
    updatedAt: iso,
    archived: false,
  };
  let wasFirst = false;
  await db.transaction('rw', db.words, db.cards, async () => {
    wasFirst = (await db.words.count()) === 0;
    await db.words.add(word);
    await db.cards.bulkAdd(DIRECTIONS.map((d) => makeCard(word.id, d, now)));
  });
  if (wasFirst) void requestPersistentStorage();
  return word;
}

export async function updateWord(id: string, input: WordInput, now = new Date()): Promise<Word> {
  const clean = sanitizeWordInput(input);
  return db.transaction('rw', db.words, db.cards, async () => {
    const existing = await db.words.get(id);
    if (!existing) throw new UserFacingError(ru.errors.notFound);
    const word: Word = { ...existing, ...clean, updatedAt: now.toISOString() };
    // Optional fields that were cleared must be removed, not kept from `existing`.
    if (!clean.transcription) delete word.transcription;
    if (!clean.note) delete word.note;
    await db.words.put(word);
    // Self-heal: make sure both cards exist.
    for (const d of DIRECTIONS) {
      const cid = cardId(id, d);
      if (!(await db.cards.get(cid))) await db.cards.add(makeCard(id, d, now));
    }
    return word;
  });
}

export async function setArchived(ids: readonly string[], archived: boolean, now = new Date()): Promise<void> {
  const iso = now.toISOString();
  await db.transaction('rw', db.words, async () => {
    await db.words
      .where('id')
      .anyOf(ids as string[])
      .modify((w) => {
        w.archived = archived;
        w.updatedAt = iso;
      });
  });
}

export interface DeletedSnapshot {
  words: Word[];
  cards: ReviewCard[];
  logs: ReviewLog[];
}

/** Deletes words with their cards and logs in one transaction; returns them for Undo. */
export async function deleteWords(ids: readonly string[]): Promise<DeletedSnapshot> {
  const list = ids as string[];
  return db.transaction('rw', db.words, db.cards, db.logs, async () => {
    const words = (await db.words.bulkGet(list)).filter((w): w is Word => !!w);
    const cards = await db.cards.where('wordId').anyOf(list).toArray();
    const logs = await db.logs.where('wordId').anyOf(list).toArray();
    await db.logs.bulkDelete(logs.map((l) => l.id));
    await db.cards.bulkDelete(cards.map((c) => c.id));
    await db.words.bulkDelete(list);
    return { words, cards, logs };
  });
}

/** Undo for deleteWords. */
export async function restoreDeleted(snapshot: DeletedSnapshot): Promise<void> {
  await db.transaction('rw', db.words, db.cards, db.logs, async () => {
    await db.words.bulkPut(snapshot.words);
    await db.cards.bulkPut(snapshot.cards);
    await db.logs.bulkPut(snapshot.logs);
  });
}

/** Resets both cards of a word to "new" (history is kept). */
export async function resetWordProgress(wordId: string, now = new Date()): Promise<void> {
  await db.transaction('rw', db.cards, async () => {
    for (const d of DIRECTIONS) await db.cards.put(makeCard(wordId, d, now));
  });
}

/* ---------- Tags ---------- */

export const TAG_COLORS = [
  '#2F6BFF',
  '#1FA971',
  '#F5A524',
  '#E5484D',
  '#8E4EC6',
  '#0EA5B7',
  '#E0679B',
  '#5B6B8C',
] as const;

export async function createTag(name: string, color: string = TAG_COLORS[0], now = new Date()): Promise<Tag> {
  const clean = cleanLine(name);
  if (!clean) throw new UserFacingError(ru.editor.errTag);
  return db.transaction('rw', db.tags, async () => {
    const existing = await db.tags.where('name').equalsIgnoreCase(clean).first();
    if (existing) return existing;
    const tag: Tag = { id: uuid(), name: clean, color, createdAt: now.toISOString() };
    await db.tags.add(tag);
    return tag;
  });
}

export async function updateTag(id: string, patch: Partial<Pick<Tag, 'name' | 'color'>>): Promise<void> {
  const name = patch.name !== undefined ? cleanLine(patch.name) : undefined;
  if (name !== undefined && !name) throw new UserFacingError(ru.editor.errTag);
  await db.tags.update(id, { ...patch, ...(name !== undefined ? { name } : {}) });
}

/** Deletes a tag and removes it from every word, in one transaction. */
export async function deleteTag(id: string, now = new Date()): Promise<void> {
  const iso = now.toISOString();
  await db.transaction('rw', db.tags, db.words, async () => {
    await db.words
      .where('tagIds')
      .equals(id)
      .modify((w) => {
        w.tagIds = w.tagIds.filter((t) => t !== id);
        w.updatedAt = iso;
      });
    await db.tags.delete(id);
  });
}

/** Adds the tag to all words, or removes it when every word already has it. Returns the action taken. */
export async function toggleTagOnWords(
  tagId: string,
  wordIds: readonly string[],
  now = new Date(),
): Promise<'added' | 'removed'> {
  const iso = now.toISOString();
  return db.transaction('rw', db.words, async () => {
    const words = (await db.words.bulkGet(wordIds as string[])).filter((w): w is Word => !!w);
    const allHave = words.length > 0 && words.every((w) => w.tagIds.includes(tagId));
    for (const w of words) {
      const tagIds = allHave ? w.tagIds.filter((t) => t !== tagId) : Array.from(new Set([...w.tagIds, tagId]));
      await db.words.update(w.id, { tagIds, updatedAt: iso });
    }
    return allHave ? 'removed' : 'added';
  });
}

/* ---------- Answers & sessions ---------- */

export interface AnswerInput {
  cardId: string;
  grade: Grade;
  wasCorrect: boolean;
  mode: ConcreteMode;
  responseMs: number;
}

export interface RecordOptions {
  practiceOnly: boolean;
  now: Date;
  dayStartsAtHour: number;
  /** Session state to persist in the same transaction. */
  session?: PersistedSession;
}

/**
 * Writes the answer logs, updates the cards (unless practice-only) and saves
 * the session progress — all in one transaction.
 */
export async function recordAnswers(answers: readonly AnswerInput[], opts: RecordOptions): Promise<void> {
  const iso = opts.now.toISOString();
  await db.transaction('rw', db.cards, db.logs, db.sessions, async () => {
    for (const a of answers) {
      const card = await db.cards.get(a.cardId);
      if (!card) continue; // word deleted meanwhile — skip gracefully, no orphan log
      if (!opts.practiceOnly) {
        const next = scheduler.schedule(card, a.grade, {
          now: opts.now,
          dayStartsAtHour: opts.dayStartsAtHour,
          seed: hashString(`${card.id}|${iso}`),
        });
        await db.cards.put({
          ...card,
          ...next,
          correctCount: card.correctCount + (a.wasCorrect ? 1 : 0),
          wrongCount: card.wrongCount + (a.wasCorrect ? 0 : 1),
        });
      }
      const log: ReviewLog = {
        id: uuid(),
        cardId: card.id,
        wordId: card.wordId,
        mode: a.mode,
        grade: a.grade,
        wasCorrect: a.wasCorrect,
        responseMs: Math.max(0, Math.round(a.responseMs)),
        reviewedAt: iso,
        ...(opts.practiceOnly ? { practice: true } : {}),
      };
      await db.logs.add(log);
    }
    if (opts.session) await db.sessions.put(opts.session);
  });
}

export async function saveActiveSession(session: PersistedSession): Promise<void> {
  await db.sessions.put({ ...session, id: 'active' });
}

/** Moves the active session to "last" (for the summary screen). */
export async function finishActiveSession(session: PersistedSession, now = new Date()): Promise<PersistedSession> {
  const last: PersistedSession = { ...session, id: 'last', finishedAt: now.toISOString(), updatedAt: now.toISOString() };
  await db.transaction('rw', db.sessions, async () => {
    await db.sessions.delete('active');
    await db.sessions.put(last);
  });
  return last;
}

export async function discardActiveSession(): Promise<void> {
  await db.sessions.delete('active');
}

/* ---------- Presets ---------- */

export async function savePreset(preset: Omit<SessionPreset, 'id' | 'createdAt'>, now = new Date()): Promise<SessionPreset> {
  const name = cleanLine(preset.name);
  if (!name) throw new UserFacingError(ru.builder.errPresetName);
  const full: SessionPreset = { ...preset, name, id: uuid(), createdAt: now.toISOString() };
  await db.presets.add(full);
  return full;
}

export async function deletePreset(id: string): Promise<void> {
  await db.presets.delete(id);
}

/* ---------- Danger zone ---------- */

export async function clearAllData(): Promise<void> {
  await db.transaction('rw', [db.words, db.cards, db.tags, db.logs, db.presets, db.settings, db.sessions], async () => {
    await Promise.all([
      db.words.clear(),
      db.cards.clear(),
      db.tags.clear(),
      db.logs.clear(),
      db.presets.clear(),
      db.settings.clear(),
      db.sessions.clear(),
    ]);
  });
}

/* ---------- Bulk import ---------- */

export type DuplicateMode = 'skip' | 'update' | 'add';

export interface ImportInputRow {
  term: string;
  translations: string[];
  transcription?: string;
  examples: string[];
  tagNames: string[];
  status: 'new' | 'duplicate' | 'duplicate-in-file' | 'error';
  existingId?: string;
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
}

/**
 * Imports previewed rows in ONE transaction: tags, words and cards. If anything
 * fails, nothing is written.
 */
export async function importWords(
  rows: readonly ImportInputRow[],
  duplicateMode: DuplicateMode,
  now = new Date(),
): Promise<ImportResult> {
  const iso = now.toISOString();
  let wasEmpty = false;
  const result = await db.transaction('rw', db.words, db.cards, db.tags, async () => {
    wasEmpty = (await db.words.count()) === 0;
    const tags = await db.tags.toArray();
    const tagByName = new Map(tags.map((t) => [t.name.toLowerCase(), t]));
    const tagIdsFor = async (names: string[]): Promise<string[]> => {
      const ids: string[] = [];
      for (const raw of names) {
        const name = cleanLine(raw);
        if (!name) continue;
        let tag = tagByName.get(name.toLowerCase());
        if (!tag) {
          tag = { id: uuid(), name, color: TAG_COLORS[tagByName.size % TAG_COLORS.length] ?? TAG_COLORS[0], createdAt: iso };
          await db.tags.add(tag);
          tagByName.set(name.toLowerCase(), tag);
        }
        ids.push(tag.id);
      }
      return Array.from(new Set(ids));
    };

    const out: ImportResult = { added: 0, updated: 0, skipped: 0 };
    for (const row of rows) {
      if (row.status === 'error' || row.status === 'duplicate-in-file') {
        out.skipped++;
        continue;
      }
      const isDup = row.status === 'duplicate' && !!row.existingId;
      if (isDup && duplicateMode === 'skip') {
        out.skipped++;
        continue;
      }
      const tagIds = await tagIdsFor(row.tagNames);
      if (isDup && duplicateMode === 'update') {
        const existing = await db.words.get(row.existingId as string);
        if (existing) {
          const clean = sanitizeWordInput({
            term: existing.term,
            translations: [...existing.translations, ...row.translations],
            transcription: row.transcription || existing.transcription,
            examples: [...existing.examples, ...row.examples],
            note: existing.note,
            tagIds: [...existing.tagIds, ...tagIds],
          });
          await db.words.put({ ...existing, ...clean, updatedAt: iso });
          out.updated++;
          continue;
        }
      }
      const clean = sanitizeWordInput({ ...row, tagIds });
      const word: Word = { id: uuid(), ...clean, createdAt: iso, updatedAt: iso, archived: false };
      await db.words.add(word);
      await db.cards.bulkAdd(DIRECTIONS.map((d) => makeCard(word.id, d, now)));
      out.added++;
    }
    return out;
  });
  if (wasEmpty && result.added > 0) void requestPersistentStorage();
  return result;
}
