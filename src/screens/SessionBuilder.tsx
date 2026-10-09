import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  AudioLines,
  BookPlus,
  Bookmark,
  Check,
  Ear,
  Keyboard,
  Layers,
  ListChecks,
  Shuffle,
  SquareDashedText,
  Play,
  Puzzle,
  X,
} from 'lucide-react';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Segmented } from '@/components/Segmented';
import { Toggle } from '@/components/Toggle';
import { EmptyState } from '@/components/EmptyState';
import { GlassPanel } from '@/components/GlassPanel';
import { BottomSheet } from '@/components/BottomSheet';
import { useCards, usePresets, useSettings, useTags, useWords } from '@/db/queries';
import { deletePreset, savePreset } from '@/db/repo';
import type { Direction, SelectionCriteria, SelectionSource, SessionPreset, TrainingMode } from '@/db/types';
import { TRAINING_MODES } from '@/db/types';
import { planSession } from '@/lib/sessionPlan';
import { modeAvailability } from '@/lib/modes';
import { mulberry32 } from '@/lib/random';
import { errorMessage } from '@/lib/errors';
import { useSpeech } from '@/hooks/useSpeech';
import { startSession } from '@/app/sessionActions';
import { useBuilderPrefill } from '@/store/ui';
import { toast } from '@/store/toast';
import { ru } from '@/i18n/ru';

type DirChoice = 'en_ru' | 'ru_en' | 'both';
type CountChoice = 5 | 10 | 20 | 'all';

const MODE_ICONS: Record<TrainingMode, ReactNode> = {
  flashcards: <Layers aria-hidden="true" className="size-5" />,
  choice: <ListChecks aria-hidden="true" className="size-5" />,
  typing: <Keyboard aria-hidden="true" className="size-5" />,
  listening: <Ear aria-hidden="true" className="size-5" />,
  cloze: <SquareDashedText aria-hidden="true" className="size-5" />,
  pairs: <Puzzle aria-hidden="true" className="size-5" />,
  mixed: <Shuffle aria-hidden="true" className="size-5" />,
};

const MODE_DESC: Record<TrainingMode, string> = {
  flashcards: ru.modes.descFlashcards,
  choice: ru.modes.descChoice,
  typing: ru.modes.descTyping,
  listening: ru.modes.descListening,
  cloze: ru.modes.descCloze,
  pairs: ru.modes.descPairs,
  mixed: ru.modes.descMixed,
};

export const SOURCE_LABELS: Record<SelectionSource, string> = {
  selected: ru.builder.srcSelectedPlain,
  tag: ru.builder.srcTag,
  all: ru.builder.srcAll,
  hard: ru.builder.srcHard,
  due: ru.builder.srcDue,
  new: ru.builder.srcNew,
};

function dirsOf(choice: DirChoice): Direction[] {
  return choice === 'both' ? ['en_ru', 'ru_en'] : [choice];
}

function dirChoiceOf(dirs: readonly Direction[]): DirChoice {
  return dirs.length === 1 && dirs[0] ? dirs[0] : 'both';
}

export default function SessionBuilder() {
  const navigate = useNavigate();
  const words = useWords();
  const cards = useCards();
  const tags = useTags();
  const presets = usePresets();
  const settings = useSettings();
  const speech = useSpeech();
  const { prefill, setPrefill } = useBuilderPrefill();

  const prefillIds = useMemo(() => (prefill?.source === 'selected' ? (prefill.wordIds ?? []) : []), [prefill]);
  const [source, setSource] = useState<SelectionSource>(prefillIds.length ? 'selected' : 'due');
  const [tagId, setTagId] = useState<string | null>(null);
  const [count, setCount] = useState<CountChoice>(prefillIds.length ? 'all' : 10);
  const [order, setOrder] = useState<'random' | 'ordered'>('random');
  const [mode, setMode] = useState<TrainingMode>('mixed');
  const [dir, setDir] = useState<DirChoice>('both');
  const [practiceOnly, setPracticeOnly] = useState(false);
  const [autoPlay, setAutoPlay] = useState(settings.autoPlayAudio);
  const [presetSheet, setPresetSheet] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetError, setPresetError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // A new prefill (from library / stats / word detail) switches the source.
  useEffect(() => {
    if (prefill?.source === 'selected' && prefill.wordIds?.length) {
      setSource('selected');
      setCount('all');
    }
  }, [prefill]);

  // If "due" is empty on first visit, fall back to "all".
  const [autoSourced, setAutoSourced] = useState(false);

  const criteria: SelectionCriteria = useMemo(
    () => ({
      source,
      ...(source === 'selected' ? { wordIds: prefillIds } : {}),
      ...(source === 'tag' && tagId ? { tagId } : {}),
      count,
      order,
    }),
    [source, prefillIds, tagId, count, order],
  );

  const config = useMemo(
    () => ({
      mode,
      directions: dirsOf(dir),
      practiceOnly,
      autoPlay,
      sourceLabel: source === 'tag' ? (tags?.find((t) => t.id === tagId)?.name ?? SOURCE_LABELS.tag) : SOURCE_LABELS[source],
      criteria,
    }),
    [mode, dir, practiceOnly, autoPlay, source, tags, tagId, criteria],
  );

  // Re-read the clock whenever cards change so "due" stays accurate.
  const now = useMemo(() => (cards ? new Date() : new Date(0)), [cards]);
  const plan = useMemo(() => {
    if (!words || !cards) return null;
    return planSession({
      config,
      selection: { words, cards, now, dayStartsAtHour: settings.dayStartsAtHour, rng: mulberry32(7) },
      modes: { allWords: words, ttsSupported: speech.supported },
    });
  }, [config, words, cards, now, settings.dayStartsAtHour, speech.supported]);

  const pickedWords = useMemo(() => {
    if (!plan || !words) return [];
    const ids = new Set(plan.wordIds);
    return words.filter((w) => ids.has(w.id));
  }, [plan, words]);

  const availability = useMemo(() => {
    const ctx = { allWords: words ?? [], ttsSupported: speech.supported };
    return Object.fromEntries(TRAINING_MODES.map((m) => [m, modeAvailability(m, pickedWords, ctx)])) as Record<
      TrainingMode,
      ReturnType<typeof modeAvailability>
    >;
  }, [pickedWords, words, speech.supported]);

  useEffect(() => {
    if (autoSourced || !plan || source !== 'due') return;
    setAutoSourced(true);
    if (plan.available === 0 && (words?.length ?? 0) > 0) setSource('all');
  }, [autoSourced, plan, source, words]);

  if (words && words.length === 0) {
    return (
      <Screen title={ru.builder.title}>
        <EmptyState icon={<BookPlus className="size-9" aria-hidden="true" />} title={ru.builder.emptyLibraryTitle} body={ru.builder.emptyLibraryBody}>
          <Button size="lg" block onClick={() => navigate('/library')}>
            {ru.tabs.library}
          </Button>
        </EmptyState>
      </Screen>
    );
  }

  const requested = count === 'all' ? Infinity : count;
  const fewer = plan && plan.available > 0 && plan.available < requested && count !== 'all';
  const cardsCount = plan?.seeds.length ?? 0;
  const wordsCount = plan?.trainedWordIds.length ?? 0;
  const modeState = availability[mode];
  const canStart = !!plan && modeState.ok && cardsCount > 0 && !(source === 'tag' && !tagId);
  const dirLabel = dir === 'both' ? ru.builder.dirSummaryBoth : dir === 'en_ru' ? ru.builder.dirEnRu : ru.builder.dirRuEn;

  const onStart = async () => {
    if (!canStart || starting) return;
    setStarting(true);
    try {
      const res = await startSession(config, speech.supported);
      if (res.ok) navigate('/session');
      else toast.error(res.reason);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  const applyPreset = (p: SessionPreset) => {
    setSource(p.selection.source === 'selected' && !p.selection.wordIds?.length ? 'all' : p.selection.source);
    if (p.selection.source === 'selected') setPrefill({ source: 'selected', wordIds: p.selection.wordIds ?? [] });
    setTagId(p.selection.tagId ?? null);
    setCount((p.selection.count === 'all' || [5, 10, 20].includes(p.selection.count) ? p.selection.count : 10) as CountChoice);
    setOrder(p.selection.order);
    setMode(p.mode);
    setDir(dirChoiceOf(p.directions));
    setPracticeOnly(!!p.practiceOnly);
    setAutoPlay(!!p.autoPlay);
  };

  const onSavePreset = async () => {
    try {
      await savePreset({
        name: presetName,
        selection: criteria,
        mode,
        directions: dirsOf(dir),
        practiceOnly,
        autoPlay,
      });
      toast.success(ru.builder.presetSaved);
      setPresetSheet(false);
      setPresetName('');
    } catch (e) {
      setPresetError(errorMessage(e));
    }
  };

  const sources: SelectionSource[] = [...(prefillIds.length ? (['selected'] as const) : []), 'due', 'new', 'all', 'hard', 'tag'];

  return (
    <Screen
      title={ru.builder.title}
      overlay={
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 px-3">
          <GlassPanel className="pointer-events-auto mx-auto max-w-xl p-3" rounded="rounded-[24px]" style={{ background: 'rgba(255,255,255,0.8)' }}>
            <p className="text-muted-glass text-caption mb-2 px-1 text-center font-medium" aria-live="polite">
              {canStart
                ? ru.builder.summary(wordsCount, ru.modes[mode], dirLabel, plan?.estimatedMinutes ?? 1)
                : !modeState.ok
                  ? modeState.reason
                  : ru.builder.noWords}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="shrink-0"
                aria-label={ru.builder.savePreset}
                title={ru.builder.savePreset}
                disabled={!canStart}
                onClick={() => {
                  setPresetError(null);
                  setPresetSheet(true);
                }}
              >
                <Bookmark aria-hidden="true" className="size-5" />
              </Button>
              <Button block size="lg" disabled={!canStart || starting} onClick={() => void onStart()} icon={<Play aria-hidden="true" className="size-5" />}>
                {ru.builder.start}
              </Button>
            </div>
          </GlassPanel>
        </div>
      }
    >
      <div className="flex flex-col gap-4 pb-24">
        {presets && presets.length > 0 && (
          <Card title={ru.today.presets}>
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <span key={p.id} className="inline-flex items-center">
                  <Chip onClick={() => applyPreset(p)} className="rounded-r-none pr-2">
                    {p.name}
                  </Chip>
                  <button
                    type="button"
                    aria-label={`${ru.builder.deletePreset}: ${p.name}`}
                    onClick={() =>
                      deletePreset(p.id)
                        .then(() => toast.info(ru.builder.presetDeleted))
                        .catch((e: unknown) => toast.error(errorMessage(e)))
                    }
                    className="text-muted flex min-h-11 w-10 items-center justify-center rounded-r-full bg-white shadow-card"
                  >
                    <X aria-hidden="true" className="size-4" />
                  </button>
                </span>
              ))}
            </div>
          </Card>
        )}

        <Card title={ru.builder.source}>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={ru.builder.source}>
            {sources.map((s) => (
              <Chip key={s} role="radio" aria-checked={source === s} active={source === s} onClick={() => setSource(s)}>
                {s === 'selected' ? ru.builder.srcSelected(prefillIds.length) : SOURCE_LABELS[s]}
              </Chip>
            ))}
          </div>
          {source === 'selected' && (
            <button
              type="button"
              className="text-primary-600 mt-2 min-h-11 text-[0.9rem] font-semibold"
              onClick={() => {
                setPrefill(null);
                setSource('all');
              }}
            >
              {ru.builder.clearSelection}
            </button>
          )}
          {source === 'tag' && (
            <div className="mt-3">
              {tags && tags.length > 0 ? (
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={ru.builder.chooseTag}>
                  {tags.map((t) => (
                    <Chip key={t.id} role="radio" aria-checked={tagId === t.id} active={tagId === t.id} dotColor={t.color} onClick={() => setTagId(t.id)}>
                      {t.name}
                    </Chip>
                  ))}
                </div>
              ) : (
                <p className="text-muted">{ru.builder.noTags}</p>
              )}
            </div>
          )}
        </Card>

        <Card title={ru.builder.count}>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={ru.builder.count}>
            {([5, 10, 20, 'all'] as const).map((c) => (
              <Chip key={c} role="radio" aria-checked={count === c} active={count === c} onClick={() => setCount(c)}>
                {c === 'all' ? ru.builder.countAll : c}
              </Chip>
            ))}
          </div>
          <div className="mt-3">
            <Segmented
              label={ru.builder.count}
              value={order}
              onChange={setOrder}
              options={[
                { value: 'random', label: ru.builder.orderRandom },
                { value: 'ordered', label: ru.builder.orderOrdered },
              ]}
            />
          </div>
          {fewer && plan && <p className="text-accent-700 mt-2 text-[0.9rem]">{ru.builder.fewerThanRequested(plan.available)}</p>}
          {plan && plan.available === 0 && <p className="text-muted mt-2 text-[0.9rem]">{ru.builder.noWordsHint}</p>}
        </Card>

        <Card title={ru.builder.mode}>
          <div className="flex flex-col gap-2" role="radiogroup" aria-label={ru.builder.mode}>
            {TRAINING_MODES.map((m) => {
              const av = availability[m];
              const active = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-disabled={!av.ok}
                  onClick={() => av.ok && setMode(m)}
                  className={`flex min-h-14 items-center gap-3 rounded-[16px] border-2 px-3 py-2 text-left transition-colors ${
                    active ? 'border-primary-500 bg-primary-50' : 'border-transparent bg-[#f5f8fe]'
                  } ${av.ok ? '' : 'opacity-60'}`}
                >
                  <span
                    className={`flex size-10 shrink-0 items-center justify-center rounded-[12px] ${
                      active ? 'bg-primary-500 text-white' : 'text-primary-600 bg-white'
                    }`}
                  >
                    {MODE_ICONS[m]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{ru.modes[m]}</span>
                    <span className="text-muted block text-[0.85rem] leading-snug">{av.ok ? MODE_DESC[m] : av.reason}</span>
                  </span>
                  {active && <Check aria-hidden="true" className="text-primary-600 size-5 shrink-0" />}
                </button>
              );
            })}
          </div>
          {mode === 'cloze' && plan && plan.skippedForMode > 0 && (
            <p className="text-accent-700 mt-2 text-[0.9rem]">{ru.builder.clozeSkipped(plan.skippedForMode)}</p>
          )}
        </Card>

        <Card title={ru.builder.direction}>
          <Segmented
            label={ru.builder.direction}
            value={dir}
            onChange={setDir}
            options={[
              { value: 'en_ru', label: ru.builder.dirEnRu },
              { value: 'ru_en', label: ru.builder.dirRuEn },
              { value: 'both', label: ru.builder.dirBoth },
            ]}
          />
        </Card>

        <Card title={ru.builder.options}>
          <Toggle checked={practiceOnly} onChange={setPracticeOnly} label={ru.builder.practiceOnly} hint={ru.builder.practiceOnlyHint} />
          {speech.supported && (
            <Toggle
              checked={autoPlay}
              onChange={setAutoPlay}
              label={
                <span className="inline-flex items-center gap-1.5">
                  <AudioLines aria-hidden="true" className="text-primary-600 size-4" />
                  {ru.builder.autoPlay}
                </span>
              }
              hint={ru.builder.autoPlayHint}
            />
          )}
        </Card>
      </div>

      <BottomSheet
        open={presetSheet}
        onClose={() => setPresetSheet(false)}
        title={ru.builder.savePreset}
        footer={
          <Button size="lg" block onClick={() => void onSavePreset()}>
            {ru.common.save}
          </Button>
        }
      >
        <label htmlFor="preset-name" className="text-muted-glass text-caption mb-1.5 block font-semibold">
          {ru.builder.presetName}
        </label>
        <input
          id="preset-name"
          value={presetName}
          onChange={(e) => {
            setPresetName(e.target.value);
            setPresetError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void onSavePreset();
          }}
          placeholder={ru.builder.presetNamePlaceholder}
          enterKeyHint="done"
          aria-invalid={!!presetError}
          className="focus:border-primary-500 min-h-12 w-full rounded-[14px] border border-[#dfe6f3] bg-white px-3.5 outline-none"
        />
        {presetError && (
          <p role="alert" className="text-danger-600 text-caption mt-1">
            {presetError}
          </p>
        )}
        <p className="text-muted text-caption mt-3">
          {ru.builder.summary(wordsCount, ru.modes[mode], dirLabel, plan?.estimatedMinutes ?? 1)}
        </p>
      </BottomSheet>
    </Screen>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="solid-card p-4">
      <h2 className="text-muted text-caption mb-3 font-semibold tracking-wide uppercase">{title}</h2>
      {children}
    </section>
  );
}
