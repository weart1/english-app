import type { WordStatus } from '@/lib/wordStatus';
import { ru } from '@/i18n/ru';

const styles: Record<WordStatus, string> = {
  new: 'bg-primary-100 text-primary-600',
  learning: 'bg-accent-100 text-accent-700',
  learned: 'bg-[#e3f6ee] text-success-600',
};

export function StatusPill({ status }: { status: WordStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[0.72rem] font-semibold whitespace-nowrap ${styles[status]}`}>
      {ru.status[status]}
    </span>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      className="bg-primary-100 h-1.5 w-full overflow-hidden rounded-full"
    >
      <div className="bg-primary-500 h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function TagDots({ colors }: { colors: string[] }) {
  if (colors.length === 0) return null;
  return (
    <span aria-hidden="true" className="flex shrink-0 -space-x-1">
      {colors.slice(0, 4).map((c, i) => (
        <span key={i} className="size-2.5 rounded-full ring-2 ring-white" style={{ background: c }} />
      ))}
    </span>
  );
}
