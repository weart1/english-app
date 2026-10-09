import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Dumbbell, X } from 'lucide-react';
import { db } from '@/db/schema';
import { discardActiveSession, finishActiveSession, getSettings, recordAnswers, saveActiveSession, type AnswerInput } from '@/db/repo';
import type { PersistedSession, ReviewCard, Settings, Word } from '@/db/types';
import { answerItems, currentItem, isFinished, progress, removeMissing, takeBatch } from '@/lib/sessionQueue';
import { meaningsOverlap } from '@/lib/distractors';
import { errorMessage } from '@/lib/errors';
import { unlockSpeech, useSpeech } from '@/hooks/useSpeech';
import { useVisualViewport } from '@/hooks/useVisualViewport';
import { useSessionUi } from '@/store/session';
import { toast } from '@/store/toast';
import { Button, IconButton } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { EmptyState } from '@/components/EmptyState';
import { ProgressBar } from '@/components/StatusPill';
import { Flashcard } from '@/modes/Flashcard';
import { MultipleChoice } from '@/modes/MultipleChoice';
import { Typing } from '@/modes/Typing';
import { Listening } from '@/modes/Listening';
import { Cloze } from '@/modes/Cloze';
import { MatchPairs, type PairsResult } from '@/modes/MatchPairs';
import type { CardModeProps, ModeResult } from '@/modes/shared';
import { ru } from '@/i18n/ru';

const PAIRS_BATCH = 5;
/** Time on one card is capped so a backgrounded app doesn't inflate "time spent". */
const MAX_MS_PER_STEP = 2 * 60 * 1000;

interface Loaded {
  session: PersistedSession;
  words: Map<string, Word>;
  allWords: Word[];
  cards: Map<string, ReviewCard>;
  settings: Settings;
}

export default function Session() {
  const navigate = useNavigate();
  const [data, setData] = useState<Loaded | null | 'missing'>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const locked = useRef(false);
  const lastStep = useRef(performance.now());
  const startedByGesture = useSessionUi((s) => s.startedByGesture);
  const [interacted, setInteracted] = useState(startedByGesture);
  const speech = useSpeech();
  const vp = useVisualViewport();

  // Load the persisted session once; afterwards React state is updated alongside each DB write.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const session = await db.sessions.get('active');
        if (!session) {
          if (alive) setData('missing');
          return;
        }
        const [allWords, settings] = await Promise.all([db.words.toArray(), getSettings()]);
        const cardIds = Array.from(new Set(session.queue.items.map((i) => i.cardId)));
        const cardList = (await db.cards.bulkGet(cardIds)).filter((c): c is ReviewCard => !!c);
        const cards = new Map(cardList.map((c) => [c.id, c]));
        const words = new Map(allWords.map((w) => [w.id, w]));
        // Words deleted while the session was paused are skipped gracefully.
        const queue = removeMissing(session.queue, (id) => cards.has(id) && words.has(cards.get(id)?.wordId ?? ''));
        let s = session;
        if (queue !== session.queue) {
          s = { ...session, queue };
          await saveActiveSession(s);
        }
        if (isFinished(s.queue)) {
          if (s.answers > 0) {
            await finishActiveSession(s);
            navigate('/session/summary', { replace: true });
          } else {
            await discardActiveSession();
            if (alive) setData('missing');
          }
          return;
        }
        if (alive) setData({ session: s, words, allWords, cards, settings });
      } catch (e) {
        toast.error(errorMessage(e));
        if (alive) setData('missing');
      }
    })();
    return () => {
      alive = false;
    };
  }, [navigate]);

  // Never let speech outlive the session screen.
  const cancelSpeech = speech.cancel;
  useEffect(() => () => cancelSpeech(), [cancelSpeech]);

  const loaded = data && data !== 'missing' ? data : null;
  const item = loaded ? currentItem(loaded.session.queue) : undefined;

  // Unlock input once the next card has rendered.
  useLayoutEffect(() => {
    locked.current = false;
    lastStep.current = performance.now();
  }, [item?.uid]);

  const handleAnswers = useCallback(
    async (answers: { uid: string; result: ModeResult }[]) => {
      if (!loaded || locked.current) return;
      locked.current = true;
      const { session } = loaded;
      const now = new Date();
      const stepMs = Math.min(MAX_MS_PER_STEP, Math.max(0, performance.now() - lastStep.current));

      const results = { ...session.results };
      const inputs: AnswerInput[] = [];
      let correctAnswers = session.correctAnswers;
      for (const a of answers) {
        const it = session.queue.items.find((x) => x.uid === a.uid);
        if (!it) continue;
        const prev = results[it.cardId] ?? { cardId: it.cardId, wordId: it.wordId, correct: 0, wrong: 0, minGrade: 3 as const };
        results[it.cardId] = {
          ...prev,
          correct: prev.correct + (a.result.wasCorrect ? 1 : 0),
          wrong: prev.wrong + (a.result.wasCorrect ? 0 : 1),
          minGrade: Math.min(prev.minGrade, a.result.grade) as 0 | 1 | 2 | 3,
        };
        if (a.result.wasCorrect) correctAnswers++;
        inputs.push({
          cardId: it.cardId,
          grade: a.result.grade,
          wasCorrect: a.result.wasCorrect,
          mode: a.result.mode ?? it.mode,
          responseMs: a.result.responseMs,
        });
      }

      const queue = answerItems(
        session.queue,
        answers.map((a) => ({ uid: a.uid, correct: a.result.wasCorrect })),
      );
      const next: PersistedSession = {
        ...session,
        queue,
        results,
        answers: session.answers + inputs.length,
        correctAnswers,
        elapsedMs: session.elapsedMs + stepMs,
        updatedAt: now.toISOString(),
      };

      try {
        await recordAnswers(inputs, {
          practiceOnly: session.config.practiceOnly,
          now,
          dayStartsAtHour: loaded.settings.dayStartsAtHour,
          session: next,
        });
        // Refresh the answered cards (interval previews for later repeats).
        const fresh = await db.cards.bulkGet(inputs.map((i) => i.cardId));
        const cards = new Map(loaded.cards);
        for (const c of fresh) if (c) cards.set(c.id, c);
        if (isFinished(queue)) {
          await finishActiveSession(next, now);
          speech.cancel();
          navigate('/session/summary', { replace: true });
          return;
        }
        setData({ ...loaded, session: next, cards });
      } catch (e) {
        toast.error(errorMessage(e));
        // Keep the learner moving even if this write failed.
        if (isFinished(queue)) navigate('/train', { replace: true });
        else setData({ ...loaded, session: next });
      }
    },
    [loaded, navigate, speech],
  );

  const onCardAnswer = useCallback(
    (r: ModeResult) => {
      if (item) void handleAnswers([{ uid: item.uid, result: r }]);
    },
    [item, handleAnswers],
  );

  const onPairsAnswer = useCallback((rs: PairsResult[]) => void handleAnswers(rs), [handleAnswers]);

  const close = async () => {
    setConfirmClose(false);
    speech.cancel();
    if (!loaded) return navigate('/train');
    try {
      if (loaded.session.answers > 0) {
        await finishActiveSession(loaded.session);
        navigate('/session/summary', { replace: true });
      } else {
        await discardActiveSession();
        navigate('/train', { replace: true });
      }
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const keyboardOpen = vp.keyboard > 80;

  if (data === 'missing') {
    return (
      <div className="app-shell pt-safe flex flex-col justify-center">
        <EmptyState icon={<Dumbbell className="size-9" aria-hidden="true" />} title={ru.session.notFound} body={ru.session.notFoundBody}>
          <Button size="lg" block onClick={() => navigate('/train', { replace: true })}>
            {ru.session.toBuilder}
          </Button>
        </EmptyState>
      </div>
    );
  }

  const prog = loaded ? progress(loaded.session.queue) : { done: 0, total: 0 };

  return (
    <div
      className="fixed inset-x-0 flex flex-col"
      style={{ top: keyboardOpen ? vp.offsetTop : 0, height: keyboardOpen ? vp.height : '100%' }}
      onPointerDownCapture={() => {
        if (!interacted) {
          unlockSpeech();
          setInteracted(true);
        }
      }}
    >
      <header className="shrink-0 px-safe" style={{ paddingTop: 'calc(var(--safe-top) + 6px)' }}>
        <div className="mx-auto flex max-w-xl items-center gap-3 pb-2">
          <IconButton label={ru.session.close} onClick={() => setConfirmClose(true)} className="-ml-1">
            <X aria-hidden="true" className="size-6" />
          </IconButton>
          <div className="flex-1">
            <ProgressBar value={prog.total ? prog.done / prog.total : 0} label={ru.session.progressAria(prog.done, prog.total)} />
          </div>
          <span className="text-muted min-w-12 text-right text-[0.9rem] font-semibold tabular-nums" aria-hidden="true">
            {ru.session.progress(prog.done, prog.total)}
          </span>
        </div>
      </header>

      <main className="scroll-area min-h-0 flex-1 px-safe">
        <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center py-3" style={{ paddingBottom: keyboardOpen ? 12 : 'calc(var(--safe-bottom) + 16px)' }}>
          {!loaded || !item ? (
            <p className="text-muted py-10 text-center" role="status">
              {ru.session.loading}
            </p>
          ) : (
            <ModeView loaded={loaded} interacted={interacted} onCardAnswer={onCardAnswer} onPairsAnswer={onPairsAnswer} />
          )}
        </div>
      </main>

      <Dialog
        open={confirmClose}
        title={ru.session.confirmCloseTitle}
        body={ru.session.confirmCloseBody}
        confirmLabel={ru.session.confirmCloseYes}
        cancelLabel={ru.session.confirmCloseNo}
        confirmVariant="danger"
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => void close()}
      />
    </div>
  );
}

function ModeView({
  loaded,
  interacted,
  onCardAnswer,
  onPairsAnswer,
}: {
  loaded: Loaded;
  interacted: boolean;
  onCardAnswer: (r: ModeResult) => void;
  onPairsAnswer: (rs: PairsResult[]) => void;
}) {
  const { session, words, allWords, cards, settings } = loaded;
  const item = currentItem(session.queue);
  if (!item) return null;

  if (item.mode === 'pairs') {
    const batch = takeBatch(session.queue, PAIRS_BATCH, (a, b) => {
      const wa = words.get(a.wordId);
      const wb = words.get(b.wordId);
      return !!wa && !!wb && meaningsOverlap(wa, wb);
    });
    if (batch.length >= 2) {
      return <MatchPairs key={batch.map((b) => b.uid).join('|')} items={batch} words={words} onAnswer={onPairsAnswer} />;
    }
    // A lone leftover card falls back to a flashcard.
  }

  const word = words.get(item.wordId);
  const card = cards.get(item.cardId);
  if (!word || !card) return null;

  const props: CardModeProps = {
    item,
    word,
    card,
    allWords,
    dayStartsAtHour: settings.dayStartsAtHour,
    practiceOnly: session.config.practiceOnly,
    autoPlay: session.config.autoPlay,
    interacted,
    onAnswer: onCardAnswer,
  };

  // Typing-style modes are keyed by mode (not card) so the input — and the iOS keyboard — survives between cards.
  switch (item.mode) {
    case 'typing':
      return <Typing key="typing" {...props} />;
    case 'cloze':
      return <Cloze key="cloze" {...props} />;
    case 'listening':
      return <Listening key="listening" {...props} />;
    case 'choice':
      return <MultipleChoice key={item.uid} {...props} />;
    case 'flashcards':
    case 'pairs':
      return <Flashcard key={item.uid} {...props} />;
  }
}
