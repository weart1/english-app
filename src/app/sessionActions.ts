import { db } from '@/db/schema';
import { getSettings, saveActiveSession } from '@/db/repo';
import type { SessionConfig } from '@/db/types';
import { createSession, planSession } from '@/lib/sessionPlan';
import { speechApiAvailable, unlockSpeech } from '@/hooks/useSpeech';
import { useSessionUi } from '@/store/session';
import { useBuilderPrefill, useLibraryStore } from '@/store/ui';
import { ru } from '@/i18n/ru';

export type StartResult = { ok: true } | { ok: false; reason: string };

/**
 * Plans and persists a new active session (replacing any unfinished one).
 * Call from a tap handler, then navigate to /session.
 */
export async function startSession(config: SessionConfig, ttsSupported = speechApiAvailable()): Promise<StartResult> {
  // Still inside the tap that started the session: unlock iOS speech for auto-play.
  unlockSpeech();
  const now = new Date();
  const [words, cards, settings] = await Promise.all([db.words.toArray(), db.cards.toArray(), getSettings()]);
  const plan = planSession({
    config,
    selection: { words, cards, now, dayStartsAtHour: settings.dayStartsAtHour, rng: Math.random },
    modes: { allWords: words, ttsSupported },
  });
  if (!plan.modeOk) return { ok: false, reason: plan.modeReason ?? ru.builder.noWords };
  if (plan.seeds.length === 0) return { ok: false, reason: ru.builder.noWords };
  await saveActiveSession(createSession(config, plan, now, Math.random));
  useSessionUi.getState().setStartedByGesture(true);
  // Starting a session consumes the library selection.
  useLibraryStore.getState().stopSelecting();
  useBuilderPrefill.getState().setPrefill(null);
  return { ok: true };
}
