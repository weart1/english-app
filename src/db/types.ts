export type Direction = 'en_ru' | 'ru_en';

export const DIRECTIONS: readonly Direction[] = ['en_ru', 'ru_en'] as const;

/** Modes the user can pick. `mixed` resolves to a concrete mode per card. */
export type TrainingMode =
  | 'flashcards'
  | 'choice'
  | 'typing'
  | 'listening'
  | 'cloze'
  | 'pairs'
  | 'mixed';

/** Modes that are actually rendered for a card (never `mixed`). */
export type ConcreteMode = Exclude<TrainingMode, 'mixed'>;

export const TRAINING_MODES: readonly TrainingMode[] = [
  'flashcards',
  'choice',
  'typing',
  'listening',
  'cloze',
  'pairs',
  'mixed',
] as const;

export type CardState = 'new' | 'learning' | 'review' | 'relearning';

/** 0 = again, 1 = hard, 2 = good, 3 = easy */
export type Grade = 0 | 1 | 2 | 3;

export interface Word {
  id: string;
  term: string;
  translations: string[];
  transcription?: string;
  examples: string[];
  note?: string;
  tagIds: string[];
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

export interface ReviewCard {
  id: string; // `${wordId}:${direction}`
  wordId: string;
  direction: Direction;
  state: CardState;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  dueAt: string;
  lastReviewedAt?: string;
  correctCount: number;
  wrongCount: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface ReviewLog {
  id: string;
  cardId: string;
  wordId: string;
  mode: TrainingMode;
  grade: Grade;
  wasCorrect: boolean;
  responseMs: number;
  reviewedAt: string;
  /** True when logged in a practice-only session (card schedule untouched). */
  practice?: boolean;
}

export type SelectionSource = 'selected' | 'tag' | 'all' | 'hard' | 'due' | 'new';

export interface SelectionCriteria {
  source: SelectionSource;
  /** For `selected`: the explicit word ids. */
  wordIds?: string[];
  /** For `tag`. */
  tagId?: string;
  /** Number of words, or `all`. */
  count: number | 'all';
  order: 'random' | 'ordered';
}

export interface SessionPreset {
  id: string;
  name: string;
  selection: SelectionCriteria;
  mode: TrainingMode;
  directions: Direction[];
  createdAt: string;
  practiceOnly?: boolean;
  autoPlay?: boolean;
}

export interface Settings {
  id: 'settings';
  dailyGoal: number;
  newWordsPerDay: number;
  ttsVoiceURI?: string;
  ttsRate: number;
  autoPlayAudio: boolean;
  dayStartsAtHour: number;
  lastBackupAt?: string;
  schemaVersion: number;
}

/* ---------- Session engine ---------- */

export interface QueueItem {
  /** Unique per presentation (changes when an item is re-inserted). */
  uid: string;
  cardId: string;
  wordId: string;
  direction: Direction;
  mode: ConcreteMode;
}

export interface QueueState {
  items: QueueItem[];
  /** Times each card has been re-inserted after a wrong answer. */
  reinsertions: Record<string, number>;
  /** Cards whose last answer was wrong and still need a correct one. */
  pending: Record<string, true>;
  /** Card ids that are finished (answered correctly, or wrong after the cap). */
  cleared: string[];
  totalCards: number;
  /** Monotonic counter used to build unique item uids. */
  seq: number;
}

export interface SessionConfig {
  mode: TrainingMode;
  directions: Direction[];
  practiceOnly: boolean;
  autoPlay: boolean;
  /** Short human label of the source, e.g. "Пора повторить". */
  sourceLabel: string;
  criteria: SelectionCriteria;
}

export interface SessionCardResult {
  cardId: string;
  wordId: string;
  correct: number;
  wrong: number;
  /** Lowest grade given in this session. */
  minGrade: Grade;
}

export interface PersistedSession {
  id: 'active' | 'last';
  config: SessionConfig;
  queue: QueueState;
  results: Record<string, SessionCardResult>;
  answers: number;
  correctAnswers: number;
  elapsedMs: number;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
}
