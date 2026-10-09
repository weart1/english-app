/**
 * Turns builder choices into a concrete, ready-to-persist session. Pure.
 */
import type { PersistedSession, SessionConfig, Word } from '@/db/types';
import { createQueue, type QueueSeed } from './sessionQueue';
import { resolveSelection, sessionCards, type SelectionContext } from './selection';
import { hasCloze } from './cloze';
import { modeAvailability, modeForCard, SECONDS_PER_CARD, type ModeContext } from './modes';
import type { Rng } from './random';

export interface PlanInput {
  config: SessionConfig;
  selection: SelectionContext & { rng: Rng };
  modes: ModeContext;
}

export interface SessionPlan {
  /** Words picked by the source + count (before mode filtering). */
  wordIds: string[];
  /** Words available in the source. */
  available: number;
  /** Words actually trained (e.g. cloze drops words without examples). */
  trainedWordIds: string[];
  skippedForMode: number;
  seeds: QueueSeed[];
  modeOk: boolean;
  modeReason?: string;
  estimatedMinutes: number;
}

export function planSession({ config, selection, modes }: PlanInput): SessionPlan {
  const { wordIds, available } = resolveSelection(config.criteria, selection);
  const wordMap = new Map(selection.words.map((w) => [w.id, w]));
  const words = wordIds.map((id) => wordMap.get(id)).filter((w): w is Word => !!w);
  const availability = modeAvailability(config.mode, words, modes);

  // Cloze only works for words that have a matching example.
  const trainable = config.mode === 'cloze' ? words.filter(hasCloze) : words;
  const trainedIds = trainable.map((w) => w.id);
  const cards = sessionCards(trainedIds, config.directions, config.criteria, selection);
  const seeds: QueueSeed[] = [];
  for (const c of cards) {
    const word = wordMap.get(c.wordId);
    if (!word) continue;
    seeds.push({
      cardId: c.id,
      wordId: c.wordId,
      direction: c.direction,
      mode: modeForCard(config.mode, c, word, modes, selection.rng),
    });
  }
  const trainedWordIds = Array.from(new Set(seeds.map((s) => s.wordId)));
  return {
    wordIds,
    available,
    trainedWordIds,
    skippedForMode: words.length - trainable.length,
    seeds,
    modeOk: availability.ok,
    modeReason: availability.reason,
    estimatedMinutes: Math.max(1, Math.round((seeds.length * SECONDS_PER_CARD[config.mode]) / 60)),
  };
}

export function createSession(config: SessionConfig, plan: SessionPlan, now: Date, rng: Rng): PersistedSession {
  const iso = now.toISOString();
  return {
    id: 'active',
    config,
    queue: createQueue(plan.seeds, { shuffle: config.criteria.order === 'random', rng }),
    results: {},
    answers: 0,
    correctAnswers: 0,
    elapsedMs: 0,
    startedAt: iso,
    updatedAt: iso,
  };
}
