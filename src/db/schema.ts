import Dexie, { type EntityTable } from 'dexie';
import type {
  PersistedSession,
  ReviewCard,
  ReviewLog,
  SessionPreset,
  Settings,
  Tag,
  Word,
} from './types';
import { applyMigrations, DB_SCHEMA_VERSION } from './migrations';

export class WordFlowDB extends Dexie {
  words!: EntityTable<Word, 'id'>;
  cards!: EntityTable<ReviewCard, 'id'>;
  tags!: EntityTable<Tag, 'id'>;
  logs!: EntityTable<ReviewLog, 'id'>;
  presets!: EntityTable<SessionPreset, 'id'>;
  settings!: EntityTable<Settings, 'id'>;
  sessions!: EntityTable<PersistedSession, 'id'>;

  constructor(name = 'wordflow') {
    super(name);
    applyMigrations(this);
  }
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  dailyGoal: 10,
  newWordsPerDay: 10,
  ttsRate: 0.9,
  autoPlayAudio: false,
  dayStartsAtHour: 4,
  schemaVersion: DB_SCHEMA_VERSION,
};

export const db = new WordFlowDB();

/** Tables in the order used by transactions and backups. */
export const ALL_TABLES = () =>
  [db.words, db.cards, db.tags, db.logs, db.presets, db.settings, db.sessions] as const;
