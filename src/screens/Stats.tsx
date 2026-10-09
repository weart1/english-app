import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { BarChart3, ChevronRight, Dumbbell } from 'lucide-react';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Heatmap } from '@/components/Heatmap';
import { ForecastChart } from '@/components/ForecastChart';
import { useCards, useLogsSince, useReviewDates, useSettings, useWords } from '@/db/queries';
import { addStudyDays, DAY_MS, startOfStudyDay } from '@/lib/dates';
import { accuracySince, forecast, heatmap, problemWords, statusTotals, type Accuracy } from '@/lib/stats';
import { useNow } from '@/hooks/useNow';
import { useBuilderPrefill } from '@/store/ui';
import { ru } from '@/i18n/ru';

export default function Stats() {
  const navigate = useNavigate();
  const words = useWords();
  const cards = useCards();
  const settings = useSettings();
  const reviewDates = useReviewDates();
  const now = useNow();
  const h = settings.dayStartsAtHour;
  const since30 = useMemo(() => new Date(startOfStudyDay(now, h).getTime() - 29 * DAY_MS).toISOString(), [now, h]);
  const logs30 = useLogsSince(since30);
  const setPrefill = useBuilderPrefill((s) => s.setPrefill);

  const totals = useMemo(() => (words && cards ? statusTotals(words, cards) : null), [words, cards]);
  const acc7 = useMemo(
    () => (logs30 ? accuracySince(logs30, addStudyDays(startOfStudyDay(now, h), -6, h)) : null),
    [logs30, now, h],
  );
  const acc30 = useMemo(() => (logs30 ? accuracySince(logs30, new Date(since30)) : null), [logs30, since30]);
  const grid = useMemo(() => heatmap(reviewDates ?? [], now, h, 16), [reviewDates, now, h]);
  const archived = useMemo(() => new Set((words ?? []).filter((w) => w.archived).map((w) => w.id)), [words]);
  const due = useMemo(() => (cards ? forecast(cards, now, h, 7, archived) : []), [cards, now, h, archived]);
  const dueLabels = useMemo(
    () =>
      due.map((_, i) => {
        if (i === 0) return ru.stats.forecastToday;
        const d = addStudyDays(startOfStudyDay(now, h), i, h);
        return ru.weekdaysShort[(d.getDay() + 6) % 7] ?? '';
      }),
    [due, now, h],
  );
  const problems = useMemo(() => (words && cards ? problemWords(words, cards, 10) : []), [words, cards]);

  if (words && words.length === 0) {
    return (
      <Screen title={ru.stats.title}>
        <EmptyState icon={<BarChart3 className="size-9" aria-hidden="true" />} title={ru.stats.emptyTitle} body={ru.stats.emptyBody}>
          <Button size="lg" block onClick={() => navigate('/library')}>
            {ru.tabs.library}
          </Button>
        </EmptyState>
      </Screen>
    );
  }

  return (
    <Screen title={ru.stats.title}>
      <div className="flex flex-col gap-4 pt-1">
        <section className="grid grid-cols-2 gap-3" aria-label={ru.stats.total}>
          <Tile label={ru.stats.total} value={totals?.total} />
          <Tile label={ru.stats.learned} value={totals?.learned} dot="var(--success-500)" />
          <Tile label={ru.stats.learning} value={totals?.learning} dot="var(--accent-400)" />
          <Tile label={ru.stats.new} value={totals?.new} dot="var(--primary-500)" />
        </section>

        <Card title={ru.stats.accuracy}>
          <div className="grid grid-cols-2 gap-3">
            <AccuracyFigure label={ru.stats.days7} acc={acc7} />
            <AccuracyFigure label={ru.stats.days30} acc={acc30} />
          </div>
        </Card>

        <Card title={ru.stats.activity} hint={ru.stats.activityHint}>
          <Heatmap weeks={grid} />
        </Card>

        <Card title={ru.stats.forecast} hint={ru.stats.forecastHint}>
          <ForecastChart values={due} labels={dueLabels} />
        </Card>

        <Card title={ru.stats.problemWords}>
          {problems.length === 0 ? (
            <p className="text-muted">{ru.stats.noProblemWords}</p>
          ) : (
            <>
              <ul className="-mx-2 divide-y divide-[#eef2fa]">
                {problems.map((p) => (
                  <li key={p.word.id}>
                    <button type="button" onClick={() => navigate(`/word/${p.word.id}`)} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 py-2 text-left">
                      <span className="min-w-0 flex-1">
                        <span lang="en" className="block truncate font-semibold">
                          {p.word.term}
                        </span>
                        <span lang="ru" className="text-muted block truncate text-[0.9rem]">
                          {p.word.translations.join(', ')}
                        </span>
                      </span>
                      <span className="text-danger-600 shrink-0 text-[0.85rem] font-semibold">✕ {ru.stats.mistakes(p.wrong)}</span>
                      <ChevronRight aria-hidden="true" className="text-muted size-5 shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
              <Button
                block
                className="mt-3"
                icon={<Dumbbell aria-hidden="true" className="size-5" />}
                onClick={() => {
                  setPrefill({ source: 'selected', wordIds: problems.map((p) => p.word.id) });
                  navigate('/train');
                }}
              >
                {ru.stats.trainThese}
              </Button>
            </>
          )}
        </Card>
      </div>
    </Screen>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="solid-card p-4">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="text-muted text-caption mt-0.5">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Tile({ label, value, dot }: { label: string; value: number | undefined; dot?: string }) {
  return (
    <div className="solid-card p-4">
      <p className="text-muted text-caption flex items-center gap-1.5">
        {dot && <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: dot }} />}
        {label}
      </p>
      <p className="mt-1 text-[1.8rem] leading-tight font-semibold">{value ?? '—'}</p>
    </div>
  );
}

function AccuracyFigure({ label, acc }: { label: string; acc: Accuracy | null }) {
  const pct = acc?.ratio == null ? null : Math.round(acc.ratio * 100);
  return (
    <div className="rounded-[16px] bg-[#f5f8fe] p-3">
      <p className="text-muted text-caption">{label}</p>
      <p className="mt-0.5 text-[1.6rem] leading-tight font-semibold">{pct === null ? '—' : `${pct}%`}</p>
      <p className="text-muted text-caption">{acc && acc.total > 0 ? `${acc.correct} из ${acc.total}` : ru.stats.noAnswers}</p>
    </div>
  );
}
