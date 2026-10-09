import { useMemo, useState } from 'react';
import { Check, Dices, Plus, Search, X } from 'lucide-react';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Segmented } from '@/components/Segmented';
import { SpeakButton } from '@/components/SpeakButton';
import { useWords } from '@/db/queries';
import { CEFR_LEVELS, type BankItem, type CefrLevel } from '@/data/wordbank/types';
import { PHRASE_TOPICS, topicByKey, WORD_TOPICS } from '@/data/wordbank/topics';
import { filterBank, isInLibrary, libraryTermSet } from '@/lib/dailyWords';
import { searchKey } from '@/lib/normalize';
import { sample } from '@/lib/random';
import { errorMessage } from '@/lib/errors';
import { useDebouncedValue } from '@/hooks/useDebounce';
import { toast } from '@/store/toast';
import { LevelBadge, useBank } from './today/DailyWords';
import { ru } from '@/i18n/ru';

const PAGE = 60;
const RANDOM_N = 10;

/** Browse the built-in dictionary by level, topic and kind; add items to the library. */
export default function Catalog() {
  const bank = useBank();
  const words = useWords();
  const [kind, setKind] = useState<'both' | 'words' | 'phrases'>('both');
  const [levels, setLevels] = useState<CefrLevel[]>([]);
  const [topic, setTopic] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState(false);
  const q = useDebouncedValue(query, 150);

  const terms = useMemo(() => libraryTermSet(words ?? []), [words]);
  const topics = kind === 'words' ? WORD_TOPICS : kind === 'phrases' ? PHRASE_TOPICS : [...WORD_TOPICS, ...PHRASE_TOPICS];

  const filtered = useMemo(() => {
    if (!bank) return [];
    const base = filterBank(bank, { levels, topics: topic ? [topic] : [], kind });
    const key = searchKey(q);
    return key ? base.filter((i) => searchKey(`${i.term} ${i.translations.join(' ')}`).includes(key)) : base;
  }, [bank, levels, topic, kind, q]);

  const add = async (items: BankItem[]) => {
    if (busy || items.length === 0) return;
    setBusy(true);
    try {
      const { addBankItems } = await import('@/app/bankActions');
      toast.success(ru.daily.added(await addBankItems(items)));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const notInLibrary = filtered.filter((i) => !isInLibrary(i, terms));

  const header = (
    <div className="flex flex-col gap-3">
      <label className="relative block">
        <span className="sr-only">{ru.catalog.search}</span>
        <Search aria-hidden="true" className="text-muted-glass pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2" />
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE);
          }}
          placeholder={ru.catalog.search}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="focus:ring-primary-500/40 h-11 w-full rounded-[14px] border border-white/80 bg-white/85 pr-11 pl-11 outline-none focus:ring-2"
        />
        {query && (
          <button
            type="button"
            aria-label={ru.a11y.clearSearch}
            onClick={() => setQuery('')}
            className="text-muted-glass absolute top-0 right-0 flex size-11 items-center justify-center"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        )}
      </label>
      <Segmented
        label={ru.catalog.title}
        value={kind}
        onChange={(v) => {
          setKind(v);
          setTopic(null);
          setLimit(PAGE);
        }}
        options={[
          { value: 'both', label: ru.catalog.all },
          { value: 'words', label: ru.catalog.words },
          { value: 'phrases', label: ru.catalog.phrases },
        ]}
      />
      <div className="hide-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label={ru.daily.settingsLevels}>
        {CEFR_LEVELS.map((l) => (
          <Chip
            key={l}
            active={levels.includes(l)}
            onClick={() => {
              setLevels((cur) => (cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l]));
              setLimit(PAGE);
            }}
          >
            {l}
          </Chip>
        ))}
      </div>
      <div className="hide-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label={ru.daily.settingsTopics}>
        <Chip active={topic === null} onClick={() => setTopic(null)}>
          {ru.catalog.allTopics}
        </Chip>
        {topics.map((t) => (
          <Chip
            key={t.key}
            active={topic === t.key}
            onClick={() => {
              setTopic(topic === t.key ? null : t.key);
              setLimit(PAGE);
            }}
          >
            {t.label}
          </Chip>
        ))}
      </div>
    </div>
  );

  return (
    <Screen title={ru.catalog.title} large={false} back headerExtra={header} alwaysGlass>
      {!bank ? (
        <p className="text-muted py-10 text-center" role="status">
          {ru.catalog.loading}
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 pt-3 pb-2">
            <p className="text-muted text-caption px-1" aria-live="polite">
              {ru.catalog.count(filtered.length, bank.length)}
            </p>
            <Button
              size="sm"
              variant="soft"
              disabled={busy || notInLibrary.length === 0}
              onClick={() => void add(sample(notInLibrary, RANDOM_N))}
              icon={<Dices aria-hidden="true" className="size-4" />}
            >
              {ru.catalog.addRandom(Math.min(RANDOM_N, notInLibrary.length))}
            </Button>
          </div>
          {filtered.length === 0 ? (
            <p className="text-muted py-8 text-center">{ru.catalog.empty}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {filtered.slice(0, limit).map((item) => {
                const inLib = isInLibrary(item, terms);
                return (
                  <li key={item.id} className="solid-card flex items-start gap-2 p-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span lang="en" className="font-semibold [overflow-wrap:anywhere]">
                          {item.term}
                        </span>
                        <LevelBadge level={item.level} />
                      </div>
                      <p lang="ru" className="text-[0.95rem]">
                        {item.translations.join(', ')}
                      </p>
                      {item.example && (
                        <p lang="en" className="text-muted mt-0.5 text-[0.85rem] italic">
                          {item.example}
                        </p>
                      )}
                      <p className="text-muted text-caption mt-0.5">{topicByKey(item.topic)?.label}</p>
                    </div>
                    <SpeakButton text={item.term} />
                    {inLib ? (
                      <span
                        className="text-success-600 flex size-11 shrink-0 items-center justify-center"
                        title={ru.catalog.inLibrary}
                        aria-label={ru.catalog.inLibrary}
                        role="img"
                      >
                        <Check className="size-5" strokeWidth={3} />
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void add([item])}
                        aria-label={ru.catalog.addAria(item.term)}
                        className="bg-primary-500 flex size-11 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-50"
                      >
                        <Plus aria-hidden="true" className="size-5" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {filtered.length > limit && (
            <Button block variant="secondary" className="mt-3" onClick={() => setLimit((l) => l + PAGE)}>
              {ru.catalog.showMore}
            </Button>
          )}
        </>
      )}
    </Screen>
  );
}
