import { useLayoutEffect, useRef, useState } from 'react';
import { CARD_FORMS, plural, ru } from '@/i18n/ru';

const HEIGHT = 120;
const BAR = 24;
const LABEL_SPACE = 18;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(300);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth || 300);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Plain-SVG column chart: cards due per day for the next 7 days.
 * Single series → no legend; values are labelled selectively (today + peak),
 * every column can be tapped, and a visually-hidden table carries all values.
 */
export function ForecastChart({ values, labels }: { values: number[]; labels: string[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...values);
  const peakValue = Math.max(...values);
  const peak = values.indexOf(peakValue);
  const slot = width / Math.max(1, values.length);
  const describe = (i: number) => `${labels[i] ?? ''}: ${values[i] ?? 0} ${plural(values[i] ?? 0, CARD_FORMS)}`;

  return (
    <figure>
      <div ref={ref} className="relative" style={{ height: HEIGHT + LABEL_SPACE + 22 }}>
        <svg width={width} height={HEIGHT + LABEL_SPACE} aria-hidden="true" className="block">
          {values.map((v, i) => {
            const h = v > 0 ? Math.max(4, (v / max) * HEIGHT) : 0;
            const x = slot * i + slot / 2 - BAR / 2;
            const y = LABEL_SPACE + HEIGHT - h;
            const showLabel = i === 0 || (i === peak && v > 0) || active === i;
            return (
              <g key={i}>
                {h > 0 && (
                  // 4px rounded data-end, square at the baseline.
                  <path
                    d={`M${x},${y + h} V${y + 4} Q${x},${y} ${x + 4},${y} H${x + BAR - 4} Q${x + BAR},${y} ${x + BAR},${y + 4} V${y + h} Z`}
                    fill={active === null || active === i ? 'var(--primary-500)' : '#8DB6FF'}
                  />
                )}
                {showLabel && (
                  <text x={x + BAR / 2} y={y - 6} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--text-strong)">
                    {v}
                  </text>
                )}
              </g>
            );
          })}
          <line x1="0" x2={width} y1={LABEL_SPACE + HEIGHT + 0.5} y2={LABEL_SPACE + HEIGHT + 0.5} stroke="#DFE6F3" strokeWidth="1" />
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex" aria-hidden="true">
          {labels.map((l, i) => (
            <span key={i} className={`flex-1 text-center text-[0.72rem] ${i === 0 ? 'text-strong font-semibold' : 'text-muted'}`}>
              {l}
            </span>
          ))}
        </div>
        {/* Hit targets larger than the marks: the whole column. */}
        <div className="absolute inset-0 flex">
          {values.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={describe(i)}
              aria-pressed={active === i}
              onClick={() => setActive(active === i ? null : i)}
              className="h-full flex-1 rounded-lg"
            />
          ))}
        </div>
      </div>
      <figcaption className="mt-1 min-h-5 text-[0.88rem] font-medium" aria-live="polite">
        {active !== null ? describe(active) : ''}
      </figcaption>
      <table className="sr-only">
        <caption>{ru.stats.forecast}</caption>
        <tbody>
          {values.map((v, i) => (
            <tr key={i}>
              <th scope="row">{labels[i]}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
