import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { ChevronRight, Clock, Flame, PartyPopper, RotateCcw, Target } from 'lucide-react';
import { Button } from '@/components/Button';
import { ProgressRing } from '@/components/ProgressRing';
import { useLastSession, useLogsSince, useReviewDates, useSettings, useWords } from '@/db/queries';
import { startOfStudyDay } from '@/lib/dates';
import { activeDayKeys, computeStreak, wordsReviewedToday } from '@/lib/stats';
import { errorMessage } from '@/lib/errors';
import { startSession } from '@/app/sessionActions';
import { toast } from '@/store/toast';
import { ru } from '@/i18n/ru';

export default function SessionSummary() {
  const navigate = useNavigate();
  const last = useLastSession();
  const words = useWords();
  const settings = useSettings();
  const [now] = useState(() => new Date());
  const todayStart = useMemo(() => startOfStudyDay(now, settings.dayStartsAtHour).toISOString(), [now, settings.dayStartsAtHour]);
  const todayLogs = useLogsSince(todayStart);
  const reviewDates = useReviewDates();
  const [busy, setBusy] = useState(false);

  const wordMap = useMemo(() => new Map((words ?? []).map((w) => [w.id, w])), [words]);

  const hard = useMemo(() => {
    if (!last) return [];
    const byWord = new Map<string, { wrong: number; minGrade: number }>();
    for (const r of Object.values(last.results)) {
      const cur = byWord.get(r.wordId) ?? { wrong: 0, minGrade: 3 };
      byWord.set(r.wordId, { wrong: cur.wrong + r.wrong, minGrade: Math.min(cur.minGrade, r.minGrade) });
    }
    return [...byWord.entries()]
      .filter(([, v]) => v.wrong > 0 || v.minGrade <= 1)
      .sort((a, b) => b[1].wrong - a[1].wrong)
      .map(([id, v]) => ({ id, wrong: v.wrong }));
  }, [last]);

  const missedIds = useMemo(() => hard.filter((h) => h.wrong > 0).map((h) => h.id).filter((id) => wordMap.has(id)), [hard, wordMap]);

  if (last === undefined) {
    return <p className="text-muted pt-safe py-10 text-center">{ru.common.loading}</p>;
  }
  if (last === null) return <Navigate to="/" replace />;

  const accuracy = last.answers ? Math.round((last.correctAnswers / last.answers) * 100) : 0;
  const finished = last.queue.items.length === 0;
  const goalDone = todayLogs ? wordsReviewedToday(todayLogs, now, settings.dayStartsAtHour) : 0;
  const streak = reviewDates ? computeStreak(activeDayKeys(reviewDates, settings.dayStartsAtHour), now, settings.dayStartsAtHour) : 0;

  const repeatMistakes = async () => {
    if (busy || missedIds.length === 0) return;
    setBusy(true);
    try {
      const res = await startSession({
        ...last.config,
        sourceLabel: ru.summary.mistakesLabel,
        criteria: { source: 'selected', wordIds: missedIds, count: 'all', order: 'random' },
      });
      if (res.ok) navigate('/session', { replace: true });
      else toast.error(res.reason);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scroll-area app-shell">
      <div className="px-safe mx-auto flex max-w-xl flex-col gap-4 pb-10" style={{ paddingTop: 'calc(var(--safe-top) + 24px)' }}>
        <div className="flex flex-col items-center text-center">
          <div className="bg-accent-100 mb-3 flex size-16 items-center justify-center rounded-[22px]">
            <PartyPopper aria-hidden="true" className="text-accent-700 size-8" />
          </div>
          <h1 className="text-large-title font-bold">{finished ? ru.summary.title : ru.summary.titlePartial}</h1>
          <p className="text-muted mt-1">{last.config.sourceLabel} · {ru.modes[last.config.mode]}</p>
        </div>

        <section className="glass flex items-center justify-around gap-2 rounded-[26px] p-5">
          <ProgressRing value={accuracy / 100} size={104} stroke={11} color="var(--primary-500)" track="var(--primary-100)" label={`${ru.summary.accuracy}: ${accuracy}%`}>
            <span className="text-[1.5rem] font-bold">{accuracy}%</span>
            <span className="text-muted-glass text-caption">{ru.summary.accuracy}</span>
          </ProgressRing>
          <dl className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Clock aria-hidden="true" className="text-primary-600 size-5" />
              <dt className="sr-only">{ru.summary.time}</dt>
              <dd className="font-semibold">{ru.summary.minutes(last.elapsedMs)}</dd>
            </div>
            <div className="flex items-center gap-2">
              <Target aria-hidden="true" className="text-accent-700 size-5" />
              <dt className="sr-only">{ru.summary.cards}</dt>
              <dd className="font-semibold">{ru.summary.goal(goalDone, settings.dailyGoal)}</dd>
            </div>
            <div className="flex items-center gap-2">
              <Flame aria-hidden="true" className="size-5 text-[#f59e0b]" />
              <dt className="sr-only">{ru.summary.streakLabel}</dt>
              <dd className="font-semibold">{ru.summary.streak(streak)}</dd>
            </div>
          </dl>
        </section>

        {last.config.practiceOnly && <p className="text-muted text-center text-[0.9rem]">{ru.summary.practiceNote}</p>}

        <section className="solid-card p-5">
          <h2 className="text-muted text-caption mb-2 font-semibold tracking-wide uppercase">{ru.summary.hardWords}</h2>
          {hard.length === 0 ? (
            <p>{ru.summary.noHardWords}</p>
          ) : (
            <ul className="-mx-2 divide-y divide-[#eef2fa]">
              {hard.map((h) => {
                const w = wordMap.get(h.id);
                if (!w) return null;
                return (
                  <li key={h.id}>
                    <button type="button" onClick={() => navigate(`/word/${h.id}`)} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 py-2 text-left">
                      <span className="min-w-0 flex-1">
                        <span lang="en" className="block truncate font-semibold">
                          {w.term}
                        </span>
                        <span lang="ru" className="text-muted block truncate text-[0.9rem]">
                          {w.translations.join(', ')}
                        </span>
                      </span>
                      {h.wrong > 0 && <span className="text-danger-600 text-[0.85rem] font-semibold">✕ {h.wrong}</span>}
                      <ChevronRight aria-hidden="true" className="text-muted size-5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-3">
          {missedIds.length > 0 && (
            <Button size="lg" variant="secondary" block disabled={busy} onClick={() => void repeatMistakes()} icon={<RotateCcw aria-hidden="true" className="size-5" />}>
              {ru.summary.repeatMistakes}
            </Button>
          )}
          <Button size="lg" block onClick={() => navigate('/', { replace: true })}>
            {ru.summary.done}
          </Button>
        </div>
      </div>
    </div>
  );
}
