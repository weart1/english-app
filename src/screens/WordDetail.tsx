import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Archive, ArchiveRestore, Check, Dumbbell, Pencil, RotateCcw, SearchX, Trash2, X } from 'lucide-react';
import { Screen } from '@/components/Screen';
import { Button, IconButton } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Dialog } from '@/components/Dialog';
import { SpeakButton } from '@/components/SpeakButton';
import { ProgressBar, StatusPill } from '@/components/StatusPill';
import { useSettings, useTags, useWord, useWordCards, useWordLogs } from '@/db/queries';
import { deleteWords, resetWordProgress, restoreDeleted, setArchived } from '@/db/repo';
import type { ReviewCard } from '@/db/types';
import { computeWordStats } from '@/lib/wordStatus';
import { formatDate, formatDateTime, formatDays, formatDue } from '@/lib/format';
import { errorMessage } from '@/lib/errors';
import { useBuilderPrefill, useEditorStore } from '@/store/ui';
import { toast } from '@/store/toast';
import { ru } from '@/i18n/ru';

const GRADE_LABELS = [ru.session.again, ru.session.hard, ru.session.good, ru.session.easy] as const;

export default function WordDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const word = useWord(id);
  const cards = useWordCards(id);
  const logs = useWordLogs(id);
  const tags = useTags();
  const settings = useSettings();
  const openEdit = useEditorStore((s) => s.openEdit);
  const setPrefill = useBuilderPrefill((s) => s.setPrefill);
  const [confirm, setConfirm] = useState<'delete' | 'reset' | null>(null);

  const stats = useMemo(() => (cards ? computeWordStats(cards) : null), [cards]);
  const now = useMemo(() => new Date(), [cards]);

  if (word === null) {
    return (
      <Screen title={ru.word.title} large={false} back="/library">
        <EmptyState icon={<SearchX className="size-9" aria-hidden="true" />} title={ru.errors.notFound}>
          <Button onClick={() => navigate('/library')}>{ru.tabs.library}</Button>
        </EmptyState>
      </Screen>
    );
  }
  if (!word || !cards || !stats) {
    return (
      <Screen title={ru.word.title} large={false} back>
        <p className="text-muted py-10 text-center">{ru.common.loading}</p>
      </Screen>
    );
  }

  const wordTags = (tags ?? []).filter((t) => word.tagIds.includes(t.id));
  const sortedCards = [...cards].sort((a, b) => (a.direction === b.direction ? 0 : a.direction === 'en_ru' ? -1 : 1));

  const onDelete = async () => {
    try {
      const snap = await deleteWords([word.id]);
      navigate('/library', { replace: true });
      toast.info(
        ru.library.deleted(1),
        { label: ru.common.undo, onClick: () => void restoreDeleted(snap).catch((e: unknown) => toast.error(errorMessage(e))) },
        5000,
      );
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Screen
      title={ru.word.title}
      large={false}
      back
      actions={
        <IconButton label={ru.common.edit} onClick={() => openEdit(word.id)}>
          <Pencil aria-hidden="true" className="size-5" />
        </IconButton>
      }
    >
      <section className="solid-card mt-2 p-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 lang="en" className="selectable text-[1.9rem] leading-tight font-semibold break-words">
              {word.term}
            </h2>
            {word.transcription && <p className="selectable text-muted mt-1">{word.transcription}</p>}
          </div>
          <SpeakButton text={word.term} size="lg" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusPill status={stats.status} />
          {word.archived && (
            <span className="bg-primary-100 text-primary-600 rounded-full px-2 py-0.5 text-[0.72rem] font-semibold">
              {ru.word.archivedBadge}
            </span>
          )}
          {wordTags.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1.5 rounded-full bg-[#f2f5fb] px-2.5 py-0.5 text-[0.8rem] font-medium">
              <span aria-hidden="true" className="size-2 rounded-full" style={{ background: t.color }} />
              {t.name}
            </span>
          ))}
        </div>
        <div className="mt-4">
          <ProgressBar value={stats.progress} label={ru.word.progress} />
        </div>
      </section>

      <Section title={ru.word.translations}>
        <ul className="selectable flex flex-col gap-1" lang="ru">
          {word.translations.map((t) => (
            <li key={t} className="text-[1.06rem]">
              {t}
            </li>
          ))}
        </ul>
      </Section>

      {word.examples.length > 0 && (
        <Section title={ru.word.examples}>
          <ul className="flex flex-col gap-3">
            {word.examples.map((ex) => (
              <li key={ex} className="flex items-start gap-2">
                <p lang="en" className="selectable flex-1 italic">
                  {ex}
                </p>
                <SpeakButton text={ex} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {word.note && (
        <Section title={ru.word.note}>
          <p className="selectable whitespace-pre-wrap">{word.note}</p>
        </Section>
      )}

      <Section title={ru.word.progress}>
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
          {sortedCards.map((c) => (
            <CardStats key={c.id} card={c} now={now} dayStartsAtHour={settings.dayStartsAtHour} />
          ))}
        </div>
      </Section>

      <Section title={ru.word.history}>
        {logs && logs.length > 0 ? (
          <ul className="divide-y divide-[#eef2fa]">
            {logs.map((l) => (
              <li key={l.id} className="flex items-center gap-3 py-2.5">
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full ${
                    l.wasCorrect ? 'bg-[#e3f6ee] text-success-600' : 'bg-[#fdecec] text-danger-600'
                  }`}
                >
                  {l.wasCorrect ? (
                    <Check aria-label={ru.a11y.correctIcon} className="size-4" />
                  ) : (
                    <X aria-label={ru.a11y.wrongIcon} className="size-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.94rem] font-medium">
                    {ru.modes[l.mode]} · {l.cardId.endsWith('en_ru') ? ru.word.directionEnRu : ru.word.directionRuEn}
                  </p>
                  <p className="text-muted text-caption">
                    {formatDateTime(l.reviewedAt, now)} · {GRADE_LABELS[l.grade]}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">{ru.word.noHistory}</p>
        )}
      </Section>

      <p className="text-muted text-caption mt-4 px-1">
        {ru.word.createdAt}: {formatDate(word.createdAt, now)}
      </p>

      <div className="mt-5 flex flex-col gap-3">
        <Button
          size="lg"
          block
          icon={<Dumbbell aria-hidden="true" className="size-5" />}
          onClick={() => {
            setPrefill({ source: 'selected', wordIds: [word.id] });
            navigate('/train');
          }}
        >
          {ru.word.trainThis}
        </Button>
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="secondary"
            icon={word.archived ? <ArchiveRestore aria-hidden="true" className="size-5" /> : <Archive aria-hidden="true" className="size-5" />}
            onClick={() =>
              setArchived([word.id], !word.archived)
                .then(() => toast.info(word.archived ? ru.library.unarchived(1) : ru.library.archived(1)))
                .catch((e: unknown) => toast.error(errorMessage(e)))
            }
          >
            {word.archived ? ru.common.unarchive : ru.common.archive}
          </Button>
          <Button variant="secondary" icon={<RotateCcw aria-hidden="true" className="size-5" />} onClick={() => setConfirm('reset')}>
            {ru.word.resetProgress}
          </Button>
        </div>
        <Button variant="secondary" className="text-danger-600" icon={<Trash2 aria-hidden="true" className="size-5" />} onClick={() => setConfirm('delete')}>
          {ru.common.delete}
        </Button>
      </div>

      <Dialog
        open={confirm === 'delete'}
        title={ru.library.deleteConfirmTitle(1)}
        body={ru.library.deleteConfirmBody}
        confirmLabel={ru.common.delete}
        confirmVariant="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void onDelete();
        }}
      />
      <Dialog
        open={confirm === 'reset'}
        title={ru.word.resetProgress}
        body={ru.word.resetConfirm}
        confirmLabel={ru.word.resetProgress}
        confirmVariant="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          resetWordProgress(word.id)
            .then(() => toast.info(ru.word.resetDone))
            .catch((e: unknown) => toast.error(errorMessage(e)));
        }}
      />
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="solid-card mt-3 p-5">
      <h3 className="text-muted text-caption mb-2 font-semibold tracking-wide uppercase">{title}</h3>
      {children}
    </section>
  );
}

function CardStats({ card, now, dayStartsAtHour }: { card: ReviewCard; now: Date; dayStartsAtHour: number }) {
  const isNew = card.state === 'new';
  return (
    <div className="rounded-[16px] bg-[#f5f8fe] p-4">
      <p className="font-semibold">{card.direction === 'en_ru' ? ru.word.directionEnRu : ru.word.directionRuEn}</p>
      {isNew ? (
        <p className="text-muted mt-1">{ru.word.notStarted}</p>
      ) : (
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[0.88rem]">
          <dt className="text-muted">{ru.word.nextReview}</dt>
          <dd className="text-right font-medium">{formatDue(card.dueAt, now, dayStartsAtHour)}</dd>
          <dt className="text-muted">{ru.word.interval}</dt>
          <dd className="text-right font-medium">{card.state === 'review' ? formatDays(card.intervalDays) : '—'}</dd>
          <dt className="text-muted">{ru.word.correct}</dt>
          <dd className="text-right font-medium">{card.correctCount}</dd>
          <dt className="text-muted">{ru.word.wrong}</dt>
          <dd className="text-right font-medium">{card.wrongCount}</dd>
          <dt className="text-muted">{ru.word.lapses}</dt>
          <dd className="text-right font-medium">{card.lapses}</dd>
          <dt className="text-muted">{ru.word.ease}</dt>
          <dd className="text-right font-medium">{card.easeFactor.toFixed(2)}</dd>
        </dl>
      )}
    </div>
  );
}
