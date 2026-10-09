/**
 * Reactive reads (useLiveQuery). Components read through these hooks and write
 * only through repo.ts.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { db, DEFAULT_SETTINGS } from './schema';
import type { PersistedSession, ReviewCard, SessionPreset, Settings, Tag, Word } from './types';

export function useSettings(): Settings {
  const s = useLiveQuery(() => db.settings.get('settings'), []);
  return { ...DEFAULT_SETTINGS, ...s, id: 'settings' };
}

/** Settings plus a flag telling whether the row was loaded yet. */
export function useSettingsLoaded(): { settings: Settings; loaded: boolean } {
  const s = useLiveQuery(async () => ({ row: await db.settings.get('settings') }), []);
  return { settings: { ...DEFAULT_SETTINGS, ...s?.row, id: 'settings' }, loaded: s !== undefined };
}

export function useWords(): Word[] | undefined {
  return useLiveQuery(() => db.words.toArray(), []);
}

export function useCards(): ReviewCard[] | undefined {
  return useLiveQuery(() => db.cards.toArray(), []);
}

export function useTags(): Tag[] | undefined {
  return useLiveQuery(() => db.tags.orderBy('name').toArray(), []);
}

export function usePresets(): SessionPreset[] | undefined {
  return useLiveQuery(() => db.presets.orderBy('createdAt').toArray(), []);
}

/** `null` when the word does not exist, `undefined` while loading. */
export function useWord(id: string | undefined): Word | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.words.get(id)) ?? null) : null), [id]);
}

export function useWordCards(wordId: string | undefined): ReviewCard[] | undefined {
  return useLiveQuery(() => (wordId ? db.cards.where('wordId').equals(wordId).toArray() : []), [wordId]);
}

export function useActiveSession(): PersistedSession | null | undefined {
  return useLiveQuery(async () => (await db.sessions.get('active')) ?? null, []);
}

export function useWordCount(): number | undefined {
  return useLiveQuery(() => db.words.count(), []);
}

export function useWordLogs(wordId: string | undefined, limit = 15) {
  return useLiveQuery(async () => {
    if (!wordId) return [];
    const logs = await db.logs.where('wordId').equals(wordId).toArray();
    return logs.sort((a, b) => (a.reviewedAt < b.reviewedAt ? 1 : -1)).slice(0, limit);
  }, [wordId, limit]);
}

/** All review timestamps (index keys only — cheap even for large histories). */
export function useReviewDates(): string[] | undefined {
  return useLiveQuery(async () => (await db.logs.orderBy('reviewedAt').keys()) as string[], []);
}

/** Logs since an ISO timestamp (e.g. start of the study day). */
export function useLogsSince(sinceIso: string) {
  return useLiveQuery(() => db.logs.where('reviewedAt').aboveOrEqual(sinceIso).toArray(), [sinceIso]);
}

export function useLastSession(): PersistedSession | null | undefined {
  return useLiveQuery(async () => (await db.sessions.get('last')) ?? null, []);
}

/** Ids of built-in dictionary items the user marked as known. */
export function useBankMarks(): Set<string> | undefined {
  return useLiveQuery(async () => new Set((await db.bankMarks.toArray()).map((m) => m.id)), []);
}

/** `null` when there is no pick for that day yet. */
export function useDailyPick(dayKey: string) {
  return useLiveQuery(async () => (await db.daily.get(dayKey)) ?? null, [dayKey]);
}
