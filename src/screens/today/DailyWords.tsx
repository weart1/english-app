import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { BookOpen, Check, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/Button';
import { SpeakButton } from '@/components/SpeakButton';
import { useBankMarks, useDailyPick, useSettings, useWords } from '@/db/queries';
import { appendDailyPick, ensureDailyPick, markBankKnown, unmarkBankKnown } from '@/db/repo';
import type { BankItem } from '@/data/wordbank/types';
import { topicByKey } from '@/data/wordbank/topics';
import { filterBank, isInLibrary, libraryTermSet, pickDaily } from '@/lib/dailyWords';
import { studyDayKey } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { toast } from '@/store/toast';
import { ru } from '@/i18n/ru';

/** Lazily loads the built-in dictionary (a separate, precached chunk). */
export function useBank(): BankItem[] | null {
  const [bank, setBank] = useState<BankItem[] | null>(null);
  useEffect(() => {
    let alive = true;
    void import('@/data/wordbank').then((m) => alive && setBank(m.getBank()));
    return () => {
      alive = false;
    };
  }, []);
  return bank;
}

export function LevelBadge({ level }: { level: string }) {
  return <span className="bg-primary-100 text-primary-600 rounded-md px-1.5 py-0.5 text-[0.7rem] font-bold">{level}</span>;
}

/** "Слова дня": a few new dictionary items per study day, stable for the day. */
export function DailyWords({ now }: { now: Date }) {
  const navigate = useNavigate();
  const settings = useSettings();
  const words = useWords();
  const marks = useBankMarks();
  const bank = useBank();
  const dayKey = studyDayKey(now, settings.dayStartsAtHour);
  const pick = useDailyPick(dayKey);
  const [busy, setBusy] = useState(false);

  const byId = useMemo(() => new Map((bank ?? []).map((i) => [i.id, i])), [bank]);
  const terms = useMemo(() => libraryTermSet(words ?? []), [words]);
  const pool = useMemo(
    () =>
      bank
        ? filterBank(bank, { levels: settings.dailyLevels, topics: settings.dailyTopics, kind: settings.dailyKind })
        : [],
    [bank, settings.dailyLevels, settings.dailyTopics, settings.dailyKind],
  );

  // Create today's pick once the data is ready.
  useEffect(() => {
    if (!bank || !words || !marks || pick !== null) return;
    void ensureDailyPick(dayKey, () =>
      pickDaily(pool, { count: settings.dailyCount, seed: dayKey, exclude: marks, libraryTerms: terms }),
    ).catch((e: unknown) => toast.error(errorMessage(e)));
  }, [bank, words, marks, pick, pool, dayKey, settings.dailyCount, terms]);

  if (settings.dailyCount <= 0) return null;

  const items = (pick?.itemIds ?? []).map((id) => byId.get(id)).filter((i): i is BankItem => !!i);
  const pending = items.filter((i) => !isInLibrary(i, terms) && !marks?.has(i.id));

  const add = async (list: BankItem[]) => {
    if (busy || list.length === 0) return;
    setBusy(true);
    try {
      const { addBankItems } = await import('@/app/bankActions');
      const n = await addBankItems(list);
      toast.success(ru.daily.added(n));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const more = async () => {
    if (!marks) return;
    const exclude = new Set([...marks, ...(pick?.itemIds ?? [])]);
    const ids = pickDaily(pool, {
      count: settings.dailyCount,
      seed: `${dayKey}-${pick?.itemIds.length ?? 0}`,
      exclude,
      libraryTerms: terms,
    });
    if (ids.length === 0) {
      toast.info(ru.daily.nothingLeft);
      return;
    }
    await appendDailyPick(dayKey, ids).catch((e: unknown) => toast.error(errorMessage(e)));
  };

  return (
    <section className="solid-card p-4" aria-labelledby="daily-title">
      <div className="mb-3 flex items-center gap-2">
        <span className="bg-accent-100 text-accent-700 flex size-9 items-center justify-center rounded-[12px]" aria-hidden="true">
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="daily-title" className="font-semibold">
            {ru.daily.title}
          </h2>
          {items.length > 0 && <p className="text-muted text-caption">{ru.daily.subtitle(pending.length)}</p>}
        </div>
      </div>

      {!bank || pick === undefined ? (
        <p className="text-muted py-2" role="status">
          {ru.daily.loading}
        </p>
      ) : items.length === 0 ? (
        <p className="text-muted py-2">{ru.daily.nothingLeft}</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map((item) => {
            const inLib = isInLibrary(item, terms);
            const known = marks?.has(item.id) ?? false;
            return (
              <li key={item.id} className={`rounded-[16px] bg-[#f5f8fe] p-3 ${inLib || known ? 'opacity-70' : ''}`}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span lang="en" className="text-[1.06rem] font-semibold [overflow-wrap:anywhere]">
                        {item.term}
                      </span>
                      <LevelBadge level={item.level} />
                    </div>
                    <p lang="ru" className="mt-0.5">
                      {item.translations.join(', ')}
                    </p>
                    {item.example && (
                      <p lang="en" className="text-muted mt-1 text-[0.9rem] italic">
                        {item.example}
                      </p>
                    )}
                    <p className="text-muted text-caption mt-1">{topicByKey(item.topic)?.label}</p>
                  </div>
                  <SpeakButton text={item.term} />
                </div>
                <div className="mt-2 flex gap-2">
                  {inLib ? (
                    <span className="text-success-600 flex min-h-9 items-center gap-1 text-[0.9rem] font-semibold">
                      <Check aria-hidden="true" className="size-4" /> {ru.daily.inLibrary}
                    </span>
                  ) : known ? (
                    <>
                      <span className="text-muted flex min-h-9 items-center gap-1 text-[0.9rem] font-semibold">
                        <Check aria-hidden="true" className="size-4" /> {ru.daily.known}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => void unmarkBankKnown([item.id])}>
                        {ru.daily.undoKnown}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" disabled={busy} onClick={() => void add([item])} icon={<Plus aria-hidden="true" className="size-4" />}>
                        {ru.daily.learn}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => void markBankKnown([item.id])}>
                        {ru.daily.know}
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {pending.length > 1 && (
          <Button size="sm" variant="soft" disabled={busy} onClick={() => void add(pending)}>
            {ru.daily.learnAll(pending.length)}
          </Button>
        )}
        {bank && (
          <Button size="sm" variant="ghost" onClick={() => void more()} icon={<Plus aria-hidden="true" className="size-4" />}>
            {ru.daily.more}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => navigate('/catalog')} icon={<BookOpen aria-hidden="true" className="size-4" />}>
          {ru.daily.catalog}
        </Button>
      </div>
    </section>
  );
}
