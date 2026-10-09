import { useState } from 'react';
import type { HeatCell } from '@/lib/stats';
import { heatLevel } from '@/lib/stats';
import { formatDate } from '@/lib/format';
import { ru } from '@/i18n/ru';

/** Sequential single-hue ramp (light → dark blue); level 0 is a neutral step off the surface. */
export const HEAT_COLORS = ['#EEF2FA', '#C5D8FF', '#8DB6FF', '#4A82FF', '#1F56E0'] as const;

const CELL = 14;
const GAP = 3;

/** GitHub-style activity grid. Tap a cell to see its date and count. */
export function Heatmap({ weeks }: { weeks: HeatCell[][] }) {
  const [active, setActive] = useState<HeatCell | null>(null);
  const todayCell = weeks.flat().find((c) => c.isToday) ?? null;
  const shown = active ?? todayCell;
  const width = weeks.length * (CELL + GAP) - GAP;

  return (
    <div>
      <div className="flex gap-2">
        <div className="text-muted flex flex-col text-[0.65rem] leading-none" aria-hidden="true" style={{ gap: GAP }}>
          {ru.weekdaysShort.map((d, i) => (
            <span key={d} className="flex items-center" style={{ height: CELL, visibility: i % 2 === 0 ? 'visible' : 'hidden' }}>
              {d}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div role="grid" aria-label={ru.stats.activity} className="flex" style={{ gap: GAP, width }}>
            {weeks.map((col, w) => (
              <div key={w} role="row" className="flex flex-col" style={{ gap: GAP }}>
                {col.map((cell) => {
                  const label = ru.stats.activityDay(formatDate(cell.date), cell.count);
                  return (
                    <button
                      key={cell.key}
                      type="button"
                      role="gridcell"
                      aria-label={label}
                      title={label}
                      disabled={cell.isFuture}
                      onClick={() => setActive(cell)}
                      className="block rounded-[4px] disabled:opacity-0"
                      style={{
                        width: CELL,
                        height: CELL,
                        background: HEAT_COLORS[heatLevel(cell.count)],
                        boxShadow: cell.isToday
                          ? '0 0 0 2px var(--accent-400)'
                          : active?.key === cell.key
                            ? '0 0 0 2px var(--text-strong)'
                            : undefined,
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.88rem] font-medium" aria-live="polite">
          {shown ? ru.stats.activityDay(formatDate(shown.date), shown.count) : ''}
        </p>
        <div className="text-muted flex items-center gap-1 text-[0.75rem]" aria-hidden="true">
          {ru.stats.less}
          {HEAT_COLORS.map((c) => (
            <span key={c} className="inline-block size-3 rounded-[3px]" style={{ background: c }} />
          ))}
          {ru.stats.moreLegend}
        </div>
      </div>
    </div>
  );
}
