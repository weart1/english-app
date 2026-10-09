import { memo, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import type { LibraryEntry } from '@/lib/library';
import { CheckMark } from '@/components/Checkbox';
import { ProgressBar, StatusPill, TagDots } from '@/components/StatusPill';
import { ru } from '@/i18n/ru';

const ACTIONS_W = 152;
const LONG_PRESS_MS = 480;
const SLOP = 8;

export interface LibraryRowProps {
  entry: LibraryEntry;
  tagColors: string[];
  selecting: boolean;
  selected: boolean;
  open: boolean;
  onOpenChange: (id: string, open: boolean) => void;
  onTap: (id: string) => void;
  onLongPress: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}

type Mode = 'idle' | 'pending' | 'horizontal';

/**
 * A solid (non-glass) library row. Tap → open / toggle; long press → selection
 * mode; swipe left → Archive / Delete. Vertical scrolling stays native
 * (touch-action: pan-y); transforms are applied directly to avoid re-renders.
 */
export const LibraryRow = memo(function LibraryRow({
  entry,
  tagColors,
  selecting,
  selected,
  open,
  onOpenChange,
  onTap,
  onLongPress,
  onArchive,
  onDelete,
}: LibraryRowProps) {
  const { word, stats } = entry;
  const contentRef = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(open);
  const g = useRef({
    mode: 'idle' as Mode,
    startX: 0,
    startY: 0,
    base: 0,
    x: 0,
    timer: 0,
    longFired: false,
    suppressClick: false,
  });

  const setX = (x: number, animate: boolean) => {
    const el = contentRef.current;
    if (!el) return;
    g.current.x = x;
    el.style.transition = animate ? 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none';
    el.style.transform = x === 0 ? '' : `translate3d(${x}px,0,0)`;
  };

  useEffect(() => {
    if (open) setRevealed(true);
    setX(open ? -ACTIONS_W : 0, true);
    if (!open) {
      const t = window.setTimeout(() => setRevealed(false), 230);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [open]);

  useEffect(() => () => window.clearTimeout(g.current.timer), []);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const s = g.current;
    s.mode = 'pending';
    s.startX = e.clientX;
    s.startY = e.clientY;
    s.base = open ? -ACTIONS_W : 0;
    s.longFired = false;
    window.clearTimeout(s.timer);
    s.timer = window.setTimeout(() => {
      if (s.mode === 'pending' && !selecting) {
        s.longFired = true;
        s.mode = 'idle';
        onLongPress(word.id);
      }
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const s = g.current;
    if (s.mode === 'idle') return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    if (s.mode === 'pending') {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      window.clearTimeout(s.timer);
      const horizontal = Math.abs(dx) > Math.abs(dy) * 1.2 && (dx < 0 || open);
      if (selecting || !horizontal) {
        s.mode = 'idle';
        return;
      }
      s.mode = 'horizontal';
      setRevealed(true);
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    const x = Math.min(0, Math.max(-ACTIONS_W - 28, s.base + dx));
    setX(x, false);
  };

  const finish = (cancelled: boolean) => {
    const s = g.current;
    window.clearTimeout(s.timer);
    if (s.mode === 'horizontal') {
      s.suppressClick = true;
      const shouldOpen = cancelled ? open : s.x < -ACTIONS_W / 2;
      setX(shouldOpen ? -ACTIONS_W : 0, true);
      if (shouldOpen !== open) onOpenChange(word.id, shouldOpen);
      else if (!shouldOpen) window.setTimeout(() => setRevealed(false), 230);
    }
    s.mode = 'idle';
  };

  const handleClick = () => {
    const s = g.current;
    if (s.suppressClick || s.longFired) {
      s.suppressClick = false;
      s.longFired = false;
      return;
    }
    if (open) {
      onOpenChange(word.id, false);
      return;
    }
    onTap(word.id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onTap(word.id);
    }
  };

  const firstTranslation = word.translations[0] ?? '';
  const ariaLabel = `${word.term} — ${word.translations.join(', ')}. ${ru.status[stats.status]}`;

  return (
    <div className="relative overflow-hidden rounded-[20px]">
      <div
        className={`absolute inset-y-0 right-0 flex overflow-hidden rounded-r-[20px] ${revealed ? '' : 'invisible'}`}
        style={{ width: ACTIONS_W + 24, paddingLeft: 24 }}
        aria-hidden={!open}
      >
        <button
          type="button"
          tabIndex={open ? 0 : -1}
          onClick={() => onArchive(word.id)}
          className="bg-primary-500 flex flex-1 flex-col items-center justify-center gap-1 text-[0.75rem] font-semibold text-white"
        >
          {word.archived ? (
            <ArchiveRestore aria-hidden="true" className="size-5" />
          ) : (
            <Archive aria-hidden="true" className="size-5" />
          )}
          {word.archived ? ru.common.unarchive : ru.common.archive}
        </button>
        <button
          type="button"
          tabIndex={open ? 0 : -1}
          onClick={() => onDelete(word.id)}
          className="bg-danger-600 flex flex-1 flex-col items-center justify-center gap-1 text-[0.75rem] font-semibold text-white"
        >
          <Trash2 aria-hidden="true" className="size-5" />
          {ru.common.delete}
        </button>
      </div>
      <div
        ref={contentRef}
        role={selecting ? 'checkbox' : 'button'}
        aria-checked={selecting ? selected : undefined}
        aria-label={selecting ? ru.library.selectRow(word.term) : ariaLabel}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => finish(false)}
        onPointerCancel={() => finish(true)}
        onClick={handleClick}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => e.preventDefault()}
        className={`no-select relative flex min-h-[76px] cursor-pointer items-center gap-3 rounded-[20px] px-4 py-3 shadow-card transition-colors ${
          selected ? 'ring-primary-500 bg-primary-50 ring-2 ring-inset' : 'bg-white'
        }`}
        style={{ touchAction: 'pan-y' }}
      >
        {selecting && <CheckMark checked={selected} />}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span lang="en" className="truncate text-[1.06rem] font-semibold">
              {word.term}
            </span>
            {word.transcription && (
              <span className="text-muted text-caption hidden truncate min-[380px]:inline">{word.transcription}</span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <span lang="ru" className="text-muted min-w-0 flex-1 truncate">
              {firstTranslation}
              {word.translations.length > 1 ? ` +${word.translations.length - 1}` : ''}
            </span>
            <TagDots colors={tagColors} />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1">
              <ProgressBar value={stats.progress} />
            </div>
            <StatusPill status={stats.status} />
          </div>
        </div>
      </div>
    </div>
  );
});
