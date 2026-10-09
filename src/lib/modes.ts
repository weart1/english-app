/**
 * Which training modes can work with which words, and the per-card mode
 * picked by "Смешанный".
 */
import type { ConcreteMode, Direction, ReviewCard, TrainingMode, Word } from '@/db/types';
import { hasCloze } from './cloze';
import { hasEnoughDistractors } from './distractors';
import type { Rng } from './random';
import { ru } from '@/i18n/ru';

export const MIN_WORDS_FOR_CHOICE = 4;
export const MIN_WORDS_FOR_PAIRS = 2;

export interface ModeContext {
  /** Whole library: the distractor pool. */
  allWords: readonly Word[];
  ttsSupported: boolean;
}

export interface ModeAvailability {
  ok: boolean;
  reason?: string;
}

/** Can the chosen mode work with this set of words at all? */
export function modeAvailability(mode: TrainingMode, words: readonly Word[], ctx: ModeContext): ModeAvailability {
  switch (mode) {
    case 'choice':
      return ctx.allWords.length >= MIN_WORDS_FOR_CHOICE ? { ok: true } : { ok: false, reason: ru.modes.reasonChoice };
    case 'listening':
      return ctx.ttsSupported ? { ok: true } : { ok: false, reason: ru.modes.reasonListening };
    case 'cloze':
      return words.some(hasCloze) ? { ok: true } : { ok: false, reason: ru.modes.reasonCloze };
    case 'pairs':
      return words.length >= MIN_WORDS_FOR_PAIRS ? { ok: true } : { ok: false, reason: ru.modes.reasonPairs };
    case 'flashcards':
    case 'typing':
    case 'mixed':
      return { ok: true };
  }
}

/** Is a concrete mode usable for one specific card? */
export function cardSupportsMode(mode: ConcreteMode, word: Word, direction: Direction, ctx: ModeContext): boolean {
  switch (mode) {
    case 'choice':
      return hasEnoughDistractors(word, ctx.allWords, direction, 3);
    case 'listening':
      return ctx.ttsSupported;
    case 'cloze':
      return hasCloze(word);
    case 'flashcards':
    case 'typing':
    case 'pairs':
      return true;
  }
}

function mixedCandidates(state: ReviewCard['state']): ConcreteMode[] {
  switch (state) {
    case 'new':
      return ['choice', 'flashcards'];
    case 'learning':
    case 'relearning':
      return ['typing', 'choice'];
    case 'review':
      return ['typing', 'listening', 'cloze'];
  }
}

/** The concrete mode to render for a card; never an ineligible one. */
export function modeForCard(
  mode: TrainingMode,
  card: Pick<ReviewCard, 'state' | 'direction'>,
  word: Word,
  ctx: ModeContext,
  rng: Rng,
): ConcreteMode {
  if (mode !== 'mixed') {
    return cardSupportsMode(mode, word, card.direction, ctx) ? mode : 'flashcards';
  }
  const options = mixedCandidates(card.state).filter((m) => cardSupportsMode(m, word, card.direction, ctx));
  if (options.length === 0) return card.state === 'new' ? 'flashcards' : 'typing';
  return options[Math.floor(rng() * options.length)] ?? options[0] ?? 'flashcards';
}

/** Rough seconds per card for the "≈ N мин" estimate. */
export const SECONDS_PER_CARD: Record<TrainingMode, number> = {
  flashcards: 7,
  choice: 6,
  typing: 12,
  listening: 12,
  cloze: 14,
  pairs: 5,
  mixed: 10,
};
