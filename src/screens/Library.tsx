import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Archive,
  ArchiveRestore,
  ArrowDownUp,
  BookPlus,
  Check,
  Dices,
  Dumbbell,
  Ellipsis,
  FileUp,
  Plus,
  Search,
  SearchX,
  Tag as TagIcon,
  Trash2,
  X,
} from 'lucide-react';
import { Screen } from '@/components/Screen';
import { Button, IconButton } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { GlassPanel } from '@/components/GlassPanel';
import { BottomSheet } from '@/components/BottomSheet';
import { Dialog } from '@/components/Dialog';
import { Stepper } from '@/components/Stepper';
import { LibraryRow } from './library/LibraryRow';
import { TagSheet } from './library/TagSheet';
import { useCards, useTags, useWords } from '@/db/queries';
import { deleteWords, restoreDeleted, setArchived } from '@/db/repo';
import { buildEntries, filterEntries, sortEntries, type LibrarySort } from '@/lib/library';
import { sample } from '@/lib/random';
import { errorMessage } from '@/lib/errors';
import { useDebouncedValue } from '@/hooks/useDebounce';
import { useBuilderPrefill, useEditorStore, useLibraryStore } from '@/store/ui';
import { toast } from '@/store/toast';
import { ru } from '@/i18n/ru';

const VIRTUALIZE_THRESHOLD = 100;
const ROW_ESTIMATE = 84;
const UNDO_MS = 5000;

const SORTS: { value: LibrarySort; label: string }[] = [
  { value: 'created', label: ru.library.sortCreated },
  { value: 'alpha', label: ru.library.sortAlpha },
  { value: 'mistakes', label: ru.library.sortMistakes },
  { value: 'due', label: ru.library.sortDue },
];

export default function Library() {
  const navigate = useNavigate();
  const words = useWords();
  const cards = useCards();
  const tags = useTags();
  const openNew = useEditorStore((s) => s.openNew);
  const setPrefill = useBuilderPrefill((s) => s.setPrefill);

  const {
    query,
    filters,
    sort,
    selecting,
    selected,
    openRowId,
    setQuery,
    setFilters,
    setSort,
    startSelecting,
    stopSelecting,
    toggle,
    selectMany,
    replaceSelection,
    clearSelection,
    setOpenRow,
  } = useLibraryStore();

  const [searchInput, setSearchInput] = useState(query);
  const debouncedQuery = useDebouncedValue(searchInput, 150);
  useEffect(() => setQuery(debouncedQuery), [debouncedQuery, setQuery]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [randomOpen, setRandomOpen] = useState(false);
  const [tagSheetOpen, setTagSheetOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);

  const entries = useMemo(() => (words && cards ? buildEntries(words, cards) : null), [words, cards]);
  // Re-read the clock whenever data changes (for the "last 7 days" filter).
  const now = useMemo(() => (entries ? new Date() : new Date(0)), [entries]);
  const visible = useMemo(
    () => (entries ? sortEntries(filterEntries(entries, query, filters, now), sort) : []),
    [entries, query, filters, sort, now],
  );
  const tagColor = useMemo(() => new Map((tags ?? []).map((t) => [t.id, t.color])), [tags]);
  const activeCount = useMemo(() => (entries ? entries.filter((e) => !e.word.archived).length : 0), [entries]);

  /* ---------- actions ---------- */

  const doDelete = useCallback(
    async (ids: string[]) => {
      try {
        const snapshot = await deleteWords(ids);
        setOpenRow(null);
        if (selecting) stopSelecting();
        toast.info(
          ru.library.deleted(snapshot.words.length),
          {
            label: ru.common.undo,
            onClick: () => {
              restoreDeleted(snapshot).catch((e: unknown) => toast.error(errorMessage(e)));
            },
          },
          UNDO_MS,
        );
      } catch (e) {
        toast.error(errorMessage(e));
      }
    },
    [selecting, setOpenRow, stopSelecting],
  );

  const doArchive = useCallback(
    async (ids: string[], archived: boolean) => {
      try {
        await setArchived(ids, archived);
        setOpenRow(null);
        toast.info(archived ? ru.library.archived(ids.length) : ru.library.unarchived(ids.length), {
          label: ru.common.undo,
          onClick: () => {
            setArchived(ids, !archived).catch((e: unknown) => toast.error(errorMessage(e)));
          },
        });
      } catch (e) {
        toast.error(errorMessage(e));
      }
    },
    [setOpenRow],
  );

  const onTap = useCallback(
    (id: string) => {
      if (useLibraryStore.getState().selecting) toggle(id);
      else navigate(`/word/${id}`);
    },
    [navigate, toggle],
  );
  const onLongPress = useCallback((id: string) => startSelecting(id), [startSelecting]);
  const onOpenChange = useCallback((id: string, open: boolean) => setOpenRow(open ? id : null), [setOpenRow]);
  const onRowArchive = useCallback(
    (id: string) => {
      const w = words?.find((x) => x.id === id);
      void doArchive([id], !w?.archived);
    },
    [words, doArchive],
  );
  const onRowDelete = useCallback((id: string) => setPendingDelete([id]), []);

  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  const trainSelected = () => {
    setPrefill({ source: 'selected', wordIds: selectedIds });
    navigate('/train');
  };

  /* ---------- render ---------- */

  const loading = !entries;
  const libraryEmpty = entries?.length === 0;
  const hasFilters = !!(filters.status || filters.tagId || filters.hard || filters.recent || filters.archived);

  const header = (
    <div className="flex flex-col gap-3">
      <label className="relative block">
        <span className="sr-only">{ru.common.search}</span>
        <Search aria-hidden="true" className="text-muted-glass pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2" />
        <input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={ru.library.searchPlaceholder}
          className="focus:ring-primary-500/40 h-11 w-full rounded-[14px] border border-white/80 bg-white/85 pr-11 pl-11 shadow-[inset_0_1px_2px_rgba(11,27,58,0.05)] outline-none focus:ring-2"
        />
        {searchInput && (
          <button
            type="button"
            aria-label={ru.a11y.clearSearch}
            onClick={() => setSearchInput('')}
            className="text-muted-glass absolute top-0 right-0 flex size-11 items-center justify-center"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        )}
      </label>
      <div className="hide-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label={ru.library.filters}>
        {(['new', 'learning', 'learned'] as const).map((st) => (
          <Chip
            key={st}
            active={filters.status === st}
            onClick={() => setFilters({ status: filters.status === st ? null : st })}
          >
            {ru.status[st]}
          </Chip>
        ))}
        <Chip active={filters.hard} onClick={() => setFilters({ hard: !filters.hard })}>
          {ru.library.filterHard}
        </Chip>
        <Chip active={filters.recent} onClick={() => setFilters({ recent: !filters.recent })}>
          {ru.library.filterRecent}
        </Chip>
        <Chip active={filters.archived} onClick={() => setFilters({ archived: !filters.archived })}>
          {ru.library.filterArchive}
        </Chip>
        {(tags ?? []).map((t) => (
          <Chip
            key={t.id}
            dotColor={t.color}
            active={filters.tagId === t.id}
            onClick={() => setFilters({ tagId: filters.tagId === t.id ? null : t.id })}
          >
            {t.name}
          </Chip>
        ))}
      </div>
      {selecting && (
        <div className="hide-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          <Button size="sm" variant="soft" icon={<Check aria-hidden="true" className="size-4" />} onClick={() => selectMany(visible.map((e) => e.word.id))}>
            {ru.library.selectAll}
          </Button>
          <Button size="sm" variant="soft" onClick={clearSelection} disabled={selected.size === 0}>
            {ru.library.clearAll}
          </Button>
          <Button size="sm" variant="soft" icon={<Dices aria-hidden="true" className="size-4" />} onClick={() => setRandomOpen(true)} disabled={visible.length === 0}>
            {ru.library.randomN}
          </Button>
        </div>
      )}
    </div>
  );

  const actions = selecting ? (
    <Button size="sm" variant="ghost" onClick={stopSelecting}>
      {ru.library.cancelSelect}
    </Button>
  ) : (
    <>
      {!libraryEmpty && (
        <Button size="sm" variant="ghost" onClick={() => startSelecting()}>
          {ru.library.select}
        </Button>
      )}
      <IconButton label={ru.library.menu} onClick={() => setMenuOpen(true)}>
        <Ellipsis aria-hidden="true" className="size-6" />
      </IconButton>
    </>
  );

  const overlay = selecting ? (
    <SelectionBar
      count={selected.size}
      archivedView={filters.archived}
      onTrain={trainSelected}
      onTag={() => setTagSheetOpen(true)}
      onArchive={() => {
        void doArchive(selectedIds, !filters.archived);
        stopSelecting();
      }}
      onDelete={() => setPendingDelete(selectedIds)}
    />
  ) : (
    !libraryEmpty && (
      <button
        type="button"
        aria-label={ru.a11y.addWord}
        onClick={openNew}
        className="bg-primary-500 active:bg-primary-600 absolute z-20 flex size-14 items-center justify-center rounded-full text-white shadow-[0_10px_24px_rgba(47,107,255,0.4)] active:scale-95"
        style={{ right: 'max(20px, var(--safe-right))', bottom: 16 }}
      >
        <Plus aria-hidden="true" className="size-7" strokeWidth={2.5} />
      </button>
    )
  );

  return (
    <>
      <LibraryList
        title={ru.library.title}
        actions={actions}
        header={libraryEmpty ? undefined : header}
        overlay={overlay}
        loading={loading}
        entriesEmpty={libraryEmpty}
        visible={visible}
        tagColor={tagColor}
        selecting={selecting}
        selected={selected}
        openRowId={openRowId}
        countLabel={ru.library.count(visible.length, filters.archived ? visible.length : activeCount)}
        emptyContent={
          libraryEmpty ? (
            <EmptyState icon={<BookPlus className="size-9" aria-hidden="true" />} title={ru.library.emptyTitle} body={ru.library.emptyBody}>
              <Button size="lg" block onClick={openNew} icon={<Plus aria-hidden="true" className="size-5" />}>
                {ru.library.emptyAction}
              </Button>
              <Button size="lg" variant="secondary" block onClick={() => navigate('/import')} icon={<FileUp aria-hidden="true" className="size-5" />}>
                {ru.library.emptyImport}
              </Button>
            </EmptyState>
          ) : filters.archived && !query && !filters.status && !filters.tagId && !filters.hard && !filters.recent ? (
            <EmptyState icon={<Archive className="size-9" aria-hidden="true" />} title={ru.library.archiveEmptyTitle} body={ru.library.archiveEmptyBody} />
          ) : (
            <EmptyState icon={<SearchX className="size-9" aria-hidden="true" />} title={ru.library.noResultsTitle} body={ru.library.noResultsBody}>
              {(hasFilters || query) && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearchInput('');
                    useLibraryStore.getState().resetFilters();
                  }}
                >
                  {ru.common.clear}
                </Button>
              )}
            </EmptyState>
          )
        }
        onTap={onTap}
        onLongPress={onLongPress}
        onOpenChange={onOpenChange}
        onArchive={onRowArchive}
        onDelete={onRowDelete}
      />

      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} title={ru.library.menu}>
        <div className="flex flex-col gap-4 pt-1">
          <Button
            variant="secondary"
            size="lg"
            block
            className="justify-start"
            icon={<FileUp aria-hidden="true" className="text-primary-600 size-5" />}
            onClick={() => {
              setMenuOpen(false);
              navigate('/import');
            }}
          >
            {ru.library.import}
          </Button>
          <div>
            <h3 className="text-muted-glass text-caption mb-2 flex items-center gap-1.5 font-semibold tracking-wide uppercase">
              <ArrowDownUp aria-hidden="true" className="size-4" />
              {ru.library.sort}
            </h3>
            <div role="radiogroup" aria-label={ru.library.sort} className="solid-card divide-y divide-[#eef2fa] overflow-hidden">
              {SORTS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  role="radio"
                  aria-checked={sort === s.value}
                  onClick={() => {
                    setSort(s.value);
                    setMenuOpen(false);
                  }}
                  className="flex min-h-12 w-full items-center justify-between px-4 text-left"
                >
                  {s.label}
                  {sort === s.value && <Check aria-hidden="true" className="text-primary-600 size-5" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      </BottomSheet>

      <RandomSheet
        open={randomOpen}
        available={visible.length}
        onClose={() => setRandomOpen(false)}
        onPick={(n) => {
          replaceSelection(sample(visible.map((e) => e.word.id), n));
          setRandomOpen(false);
        }}
      />

      <TagSheet open={tagSheetOpen} onClose={() => setTagSheetOpen(false)} wordIds={selectedIds} />

      <Dialog
        open={!!pendingDelete}
        title={ru.library.deleteConfirmTitle(pendingDelete?.length ?? 0)}
        body={ru.library.deleteConfirmBody}
        confirmLabel={ru.common.delete}
        confirmVariant="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const ids = pendingDelete ?? [];
          setPendingDelete(null);
          void doDelete(ids);
        }}
      />
    </>
  );
}

/* ---------- list (plain or virtualized) ---------- */

interface LibraryListProps {
  title: string;
  actions: ReactNode;
  header?: ReactNode;
  overlay: ReactNode;
  loading: boolean;
  entriesEmpty: boolean | undefined;
  visible: ReturnType<typeof sortEntries>;
  tagColor: Map<string, string>;
  selecting: boolean;
  selected: ReadonlySet<string>;
  openRowId: string | null;
  countLabel: string;
  emptyContent: ReactNode;
  onTap: (id: string) => void;
  onLongPress: (id: string) => void;
  onOpenChange: (id: string, open: boolean) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}

function LibraryList(p: LibraryListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const virtual = p.visible.length > VIRTUALIZE_THRESHOLD;

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => setScrollMargin(list.offsetTop);
    measure();
    const ro = new ResizeObserver(measure);
    const headerEl = scrollRef.current?.querySelector('header');
    if (headerEl) ro.observe(headerEl);
    return () => ro.disconnect();
  }, [virtual, p.loading]);

  const virtualizer = useVirtualizer({
    count: virtual ? p.visible.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: 8,
    scrollMargin,
    getItemKey: (i) => p.visible[i]?.word.id ?? i,
  });

  const renderRow = (i: number) => {
    const e = p.visible[i];
    if (!e) return null;
    return (
      <LibraryRow
        entry={e}
        tagColors={e.word.tagIds.map((id) => p.tagColor.get(id)).filter((c): c is string => !!c)}
        selecting={p.selecting}
        selected={p.selected.has(e.word.id)}
        open={p.openRowId === e.word.id}
        onOpenChange={p.onOpenChange}
        onTap={p.onTap}
        onLongPress={p.onLongPress}
        onArchive={p.onArchive}
        onDelete={p.onDelete}
      />
    );
  };

  return (
    <Screen ref={scrollRef} title={p.title} actions={p.actions} headerExtra={p.header} overlay={p.overlay} alwaysGlass={!!p.header}>
      {p.loading ? (
        <p className="text-muted py-10 text-center" role="status">
          {ru.common.loading}
        </p>
      ) : p.visible.length === 0 ? (
        p.emptyContent
      ) : (
        <>
          <p className="text-muted text-caption px-1 pt-3 pb-2" aria-live="polite">
            {p.countLabel}
          </p>
          {virtual ? (
            <div ref={listRef} className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((item) => (
                <div
                  key={item.key}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  className="absolute top-0 left-0 w-full pb-2"
                  style={{ transform: `translateY(${item.start - scrollMargin}px)` }}
                >
                  {renderRow(item.index)}
                </div>
              ))}
            </div>
          ) : (
            <div ref={listRef} className="flex flex-col gap-2">
              {p.visible.map((e, i) => (
                <div key={e.word.id}>{renderRow(i)}</div>
              ))}
            </div>
          )}
        </>
      )}
    </Screen>
  );
}

/* ---------- selection action bar ---------- */

function SelectionBar({
  count,
  archivedView,
  onTrain,
  onTag,
  onArchive,
  onDelete,
}: {
  count: number;
  archivedView: boolean;
  onTrain: () => void;
  onTag: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const none = count === 0;
  const item =
    'flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-[14px] px-1 text-[0.72rem] font-semibold whitespace-nowrap disabled:opacity-40';
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 px-3">
      <GlassPanel
        className="animate-fade-in pointer-events-auto mx-auto max-w-xl p-2"
        rounded="rounded-[22px]"
        style={{ background: 'rgba(255,255,255,0.82)' }}
      >
        <p className="text-caption px-2 pt-0.5 pb-1.5 font-semibold" aria-live="polite">
          {ru.library.selected(count)}
        </p>
        <div className="flex items-stretch gap-1">
          <button type="button" className={`${item} bg-primary-500 text-white`} disabled={none} onClick={onTrain}>
            <Dumbbell aria-hidden="true" className="size-5" />
            {ru.library.train}
          </button>
          <button type="button" className={`${item} text-primary-600`} disabled={none} onClick={onTag}>
            <TagIcon aria-hidden="true" className="size-5" />
            {ru.library.tag}
          </button>
          <button type="button" className={`${item} text-primary-600`} disabled={none} onClick={onArchive}>
            {archivedView ? <ArchiveRestore aria-hidden="true" className="size-5" /> : <Archive aria-hidden="true" className="size-5" />}
            {archivedView ? ru.common.unarchive : ru.common.archive}
          </button>
          <button type="button" className={`${item} text-danger-600`} disabled={none} onClick={onDelete}>
            <Trash2 aria-hidden="true" className="size-5" />
            {ru.common.delete}
          </button>
        </div>
      </GlassPanel>
    </div>
  );
}

/* ---------- random N ---------- */

function RandomSheet({
  open,
  available,
  onClose,
  onPick,
}: {
  open: boolean;
  available: number;
  onClose: () => void;
  onPick: (n: number) => void;
}) {
  const [n, setN] = useState(5);
  useEffect(() => {
    if (open) setN((v) => Math.max(1, Math.min(v, available)));
  }, [open, available]);
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={ru.library.randomTitle}
      footer={
        <Button size="lg" block onClick={() => onPick(n)} disabled={available === 0}>
          {ru.library.randomPick(n)}
        </Button>
      }
    >
      <p className="text-muted-glass">{ru.library.randomBody(available)}</p>
      <div className="mt-5 flex flex-col items-center gap-4">
        <Stepper value={n} min={1} max={Math.max(1, available)} onChange={setN} label={ru.library.randomTitle} />
        <div className="flex flex-wrap justify-center gap-2">
          {[5, 10, 20].map((v) => (
            <Chip key={v} active={n === v} disabled={v > available} onClick={() => setN(v)}>
              {v}
            </Chip>
          ))}
        </div>
      </div>
    </BottomSheet>
  );
}
