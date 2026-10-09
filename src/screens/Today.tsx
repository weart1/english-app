import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookPlus, Dumbbell, Flame, Play, Settings as SettingsIcon, Sparkles } from 'lucide-react';
import { Screen } from '@/components/Screen';
import { Button, IconButton } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { ProgressRing } from '@/components/ProgressRing';
import { BackupBanner, InstallBanner } from './today/Banners';
import { useActiveSession, useCards, useLogsSince, usePresets, useReviewDates, useSettings, useWords } from '@/db/queries';
import { db } from '@/db/schema';
import type { SessionConfig, SessionPreset } from '@/db/types';
import { endOfStudyDay, startOfStudyDay } from '@/lib/dates';
import { activeDayKeys, computeStreak, wordsReviewedToday } from '@/lib/stats';
import { errorMessage } from '@/lib/errors';
import { useNow } from '@/hooks/useNow';
import { unlockSpeech } from '@/hooks/useSpeech';
import { useEditorStore } from '@/store/ui';
import { toast } from '@/store/toast';
import { ru } from '@/i18n/ru';

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 5) return ru.today.greetingNight;
  if (h < 12) return ru.today.greetingMorning;
  if (h < 18) return ru.today.greetingDay;
  return ru.today.greetingEvening;
}


export default function Today() {
  const navigate = useNavigate();
  const settings = useSettings();
  const words = useWords();
  const cards = useCards();
  const presets = usePresets();
  const activeSession = useActiveSession();
  const reviewDates = useReviewDates();
  const openNew = useEditorStore((s) => s.openNew);
  const [busy, setBusy] = useState(false);

  // Refreshes every minute and on returning to the app, so day boundaries roll over.
  const now = useNow();
  const h = settings.dayStartsAtHour;
  const dayStartIso = useMemo(() => startOfStudyDay(now, h).toISOString(), [now, h]);
  const todayLogs = useLogsSince(dayStartIso);

  // Words whose very first review happened today count against "new words per day".
  const introducedToday = useLiveQuery(async () => {
    const logs = await db.logs.where('reviewedAt').aboveOrEqual(dayStartIso).toArray();
    const ids = Array.from(new Set(logs.map((l) => l.wordId)));
    let n = 0;
    for (const id of ids) {
      const earlier = await db.logs
        .where('wordId')
        .equals(id)
        .filter((l) => l.reviewedAt < dayStartIso)
        .count();
      if (earlier === 0) n++;
    }
    return n;
  }, [dayStartIso]);

  const counts = useMemo(() => {
    if (!words || !cards) return null;
    const archived = new Set(words.filter((w) => w.archived).map((w) => w.id));
    const end = endOfStudyDay(now, h).getTime();
    let due = 0;
    const cardsByWord = new Map<string, number>();
    for (const c of cards) {
      if (archived.has(c.wordId)) continue;
      if (c.state !== 'new' && Date.parse(c.dueAt) < end) due++;
      if (c.state !== 'new') cardsByWord.set(c.wordId, (cardsByWord.get(c.wordId) ?? 0) + 1);
    }
    const newAvailable = words.filter((w) => !w.archived && !cardsByWord.has(w.id)).length;
    return { due, newAvailable };
  }, [words, cards, now, h]);

  const goalDone = todayLogs ? wordsReviewedToday(todayLogs, now, h) : 0;
  const streak = reviewDates ? computeStreak(activeDayKeys(reviewDates, h), now, h) : 0;
  const newLimit = Math.max(0, settings.newWordsPerDay - (introducedToday ?? 0));
  const newCount = counts ? Math.min(newLimit, counts.newAvailable) : 0;

  const run = async (config: SessionConfig) => {
    if (busy) return;
    // Must run synchronously inside the tap (before any await) to unlock iOS speech.
    unlockSpeech();
    setBusy(true);
    try {
      // Loaded on tap: keeps the session planner out of the first-load bundle.
      const { startSession } = await import('@/app/sessionActions');
      const res = await startSession(config);
      if (res.ok) navigate('/session');
      else toast.error(res.reason);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const startReview = () =>
    run({
      mode: 'mixed',
      directions: ['en_ru', 'ru_en'],
      practiceOnly: false,
      autoPlay: settings.autoPlayAudio,
      sourceLabel: ru.today.reviewSourceLabel,
      criteria: { source: 'due', count: 'all', order: 'random' },
    });

  const startNew = () =>
    run({
      mode: 'mixed',
      directions: ['en_ru', 'ru_en'],
      practiceOnly: false,
      autoPlay: settings.autoPlayAudio,
      sourceLabel: ru.today.newSourceLabel,
      criteria: { source: 'new', count: Math.max(1, newCount), order: 'ordered' },
    });

  const startPreset = (p: SessionPreset) =>
    run({
      mode: p.mode,
      directions: p.directions,
      practiceOnly: !!p.practiceOnly,
      autoPlay: !!p.autoPlay,
      sourceLabel: p.name,
      criteria: p.selection,
    });

  const title = greeting(now);
  const subtitle = `${ru.dates.weekdaysFull[now.getDay()]}, ${now.getDate()} ${ru.dates.monthsGenitive[now.getMonth()]}`;

  const gear = (
    <IconButton label={ru.today.settings} onClick={() => navigate('/settings')}>
      <SettingsIcon aria-hidden="true" className="size-6" />
    </IconButton>
  );

  if (words && words.length === 0) {
    return (
      <Screen title={title} actions={gear}>
        <InstallBanner />
        <EmptyState icon={<BookPlus className="size-9" aria-hidden="true" />} title={ru.today.emptyTitle} body={ru.today.emptyBody}>
          <Button size="lg" block onClick={openNew}>
            {ru.today.emptyAction}
          </Button>
          <Button size="lg" variant="secondary" block onClick={() => navigate('/import')}>
            {ru.library.emptyImport}
          </Button>
        </EmptyState>
      </Screen>
    );
  }

  return (
    <Screen title={title} actions={gear}>
      <p className="text-muted -mt-1 mb-4 px-0.5 first-letter:uppercase">{subtitle}</p>
      <div className="flex flex-col gap-4">

        <section className="solid-card flex items-center gap-5 p-5" aria-label={ru.today.goalAria(goalDone, settings.dailyGoal)}>
          <ProgressRing value={goalDone / Math.max(1, settings.dailyGoal)} size={112} stroke={12} label={ru.today.goalAria(goalDone, settings.dailyGoal)}>
            <span className="text-[1.45rem] leading-none font-bold tabular-nums">{goalDone}</span>
            <span className="text-muted text-caption mt-0.5">{ru.common.ofShort(settings.dailyGoal)}</span>
          </ProgressRing>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{ru.today.goal(goalDone, settings.dailyGoal)}</p>
            <div className="bg-accent-100 mt-3 inline-flex items-center gap-2 rounded-full py-1.5 pr-3.5 pl-2.5">
              <Flame aria-hidden="true" className={`size-5 ${streak > 0 ? 'fill-accent-400 text-[#f59e0b]' : 'text-accent-700'}`} />
              <span className="text-accent-700 text-[0.92rem] font-semibold">{streak > 0 ? ru.today.streak(streak) : ru.today.streakZero}</span>
            </div>
          </div>
        </section>

        {activeSession && activeSession.queue.items.length > 0 && (
          <Button
            size="lg"
            variant="accent"
            block
            onClick={() => navigate('/session')}
            icon={<Play aria-hidden="true" className="size-5" />}
          >
            {ru.today.continueSession(new Set(activeSession.queue.items.map((i) => i.cardId)).size)}
          </Button>
        )}

        {counts && counts.due > 0 ? (
          <Button size="lg" block disabled={busy} onClick={() => void startReview()} icon={<Play aria-hidden="true" className="size-5" />} className="min-h-16 text-[1.15rem]">
            {ru.today.review(counts.due)}
          </Button>
        ) : (
          counts && (
            <section className="glass rounded-[24px] p-5 text-center">
              <p className="text-title font-semibold">{ru.today.allDone}</p>
              <p className="text-muted-glass mt-1">{ru.today.nothingDueHint}</p>
              <div className="mt-4 flex flex-col gap-2">
                {newCount > 0 && (
                  <Button block disabled={busy} onClick={() => void startNew()} icon={<Sparkles aria-hidden="true" className="size-5" />}>
                    {ru.today.learnNew} ({newCount})
                  </Button>
                )}
                <Button block variant="secondary" onClick={() => navigate('/train')} icon={<Dumbbell aria-hidden="true" className="size-5" />}>
                  {ru.today.freeTraining}
                </Button>
              </div>
            </section>
          )
        )}

        {counts && counts.due > 0 && (
          <Button
            size="lg"
            variant="secondary"
            block
            disabled={busy || newCount === 0}
            onClick={() => void startNew()}
            icon={<Sparkles aria-hidden="true" className="text-accent-700 size-5" />}
          >
            {newCount > 0 ? ru.today.newWords(newCount) : ru.today.newWordsNone}
          </Button>
        )}

        {presets && presets.length > 0 && (
          <section>
            <h2 className="text-muted text-caption mb-2 px-1 font-semibold tracking-wide uppercase">{ru.today.presets}</h2>
            <div className="hide-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
              {presets.map((p) => (
                <Chip key={p.id} disabled={busy} onClick={() => void startPreset(p)} icon={<Play aria-hidden="true" className="text-primary-600 size-4" />}>
                  {p.name}
                </Chip>
              ))}
            </div>
          </section>
        )}
        <InstallBanner />
        <BackupBanner wordCount={words?.length ?? 0} lastBackupAt={settings.lastBackupAt} now={now} />
      </div>
    </Screen>
  );
}
