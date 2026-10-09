import type Dexie from 'dexie';

/**
 * Database schema history. Never edit a released version: add a new
 * `db.version(n)` with an `.upgrade()` that migrates existing user data.
 *
 * Note: `archived` is a boolean and IndexedDB cannot index booleans, so it is
 * filtered in memory (the library is loaded fully for search anyway).
 */
export const DB_SCHEMA_VERSION = 2;

export function applyMigrations(db: Dexie): void {
  db.version(1).stores({
    words: 'id, term, createdAt, updatedAt, *tagIds',
    cards: 'id, wordId, direction, dueAt, state',
    logs: 'id, wordId, cardId, reviewedAt',
    tags: 'id, name',
    presets: 'id, createdAt',
    settings: 'id',
    sessions: 'id',
  });

  // v2: built-in dictionary ("Слова дня"). New tables only; existing data is untouched.
  db.version(2)
    .stores({
      bankMarks: 'id',
      daily: 'id',
    })
    .upgrade((tx) =>
      tx
        .table('settings')
        .toCollection()
        .modify((s: { schemaVersion?: number }) => {
          s.schemaVersion = 2;
        }),
    );
}
