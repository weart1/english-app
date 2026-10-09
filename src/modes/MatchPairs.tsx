import { useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import type { QueueItem, Word } from '@/db/types';
import { shuffle, hashString, mulberry32 } from '@/lib/random';
import { autoGrade } from '@/lib/srs';
import { optionText } from '@/lib/distractors';
import type { ModeResult } from './shared';
import { ru } from '@/i18n/ru';

export interface PairsResult {
  uid: string;
  result: ModeResult;
}

interface MatchPairsProps {
  items: QueueItem[];
  words: ReadonlyMap<string, Word>;
  onAnswer: (results: PairsResult[]) => void;
}

interface Side {
  uid: string;
  text: string;
}

/**
 * Пары: tap a word on the left and its translation on the right. Correct pairs
 * fade out, a wrong pair shakes. A word counts as correct only if it was never
 * part of a wrong pair.
 */
export function MatchPairs({ items, words, onAnswer }: MatchPairsProps) {
  const batchKey = items.map((i) => i.uid).join('|');
  const direction = items[0]?.direction ?? 'en_ru';
  const left: Side[] = useMemo(
    () =>
      items.map((it) => {
        const w = words.get(it.wordId);
        return { uid: it.uid, text: w ? (direction === 'en_ru' ? w.term : optionText(w, 'en_ru')) : '' };
      }),
    // Recomputed only when the batch changes, not when the word map is refreshed.
    [batchKey],
  );
  const right: Side[] = useMemo(
    () =>
      shuffle(
        items.map((it) => {
          const w = words.get(it.wordId);
          return { uid: it.uid, text: w ? (direction === 'en_ru' ? optionText(w, 'en_ru') : w.term) : '' };
        }),
        mulberry32(hashString(batchKey)),
      ),
    [batchKey],
  );

  const [selLeft, setSelLeft] = useState<string | null>(null);
  const [selRight, setSelRight] = useState<string | null>(null);
  const [matched, setMatched] = useState<ReadonlySet<string>>(new Set());
  const [errored, setErrored] = useState<ReadonlySet<string>>(new Set());
  const [shake, setShake] = useState<{ l: string; r: string; n: number } | null>(null);
  const started = useRef(performance.now());
  const sent = useRef(false);

  const leftLang = direction === 'en_ru' ? 'en' : 'ru';
  const rightLang = direction === 'en_ru' ? 'ru' : 'en';

  const tryMatch = (l: string | null, r: string | null) => {
    if (!l || !r) return;
    if (l === r) {
      setMatched((m) => new Set([...m, l]));
    } else {
      setErrored((e) => new Set([...e, l, r]));
      setShake((s) => ({ l, r, n: (s?.n ?? 0) + 1 }));
    }
    setSelLeft(null);
    setSelRight(null);
  };

  const allDone = matched.size === items.length && items.length > 0;

  useEffect(() => {
    if (!allDone || sent.current) return;
    const t = window.setTimeout(() => {
      if (sent.current) return;
      sent.current = true;
      const perItem = (performance.now() - started.current) / Math.max(1, items.length);
      onAnswer(
        items.map((it) => {
          const wrong = errored.has(it.uid);
          const g = autoGrade({ correct: !wrong, responseMs: perItem });
          return { uid: it.uid, result: { ...g, responseMs: perItem, mode: 'pairs' } };
        }),
      );
    }, 700);
    return () => window.clearTimeout(t);
  }, [allDone, errored, items, onAnswer]);

  const cell = (side: 'l' | 'r', s: Side) => {
    const isMatched = matched.has(s.uid);
    const selected = side === 'l' ? selLeft === s.uid : selRight === s.uid;
    const shaking = shake && (side === 'l' ? shake.l === s.uid : shake.r === s.uid);
    return (
      <li key={`${s.uid}-${side}-${shaking ? shake?.n : 0}`}>
        <button
          type="button"
          disabled={isMatched}
          lang={side === 'l' ? leftLang : rightLang}
          aria-pressed={selected}
          onClick={() => {
            if (side === 'l') {
              const next = selLeft === s.uid ? null : s.uid;
              setSelLeft(next);
              tryMatch(next, selRight);
            } else {
              const next = selRight === s.uid ? null : s.uid;
              setSelRight(next);
              tryMatch(selLeft, next);
            }
          }}
          className={`flex min-h-16 w-full items-center justify-center gap-1.5 rounded-[16px] border-2 px-2 py-2 text-center text-[0.98rem] leading-snug font-medium transition-[opacity,background-color,border-color] duration-300 [overflow-wrap:anywhere] ${
            isMatched
              ? 'border-success-500 bg-[#e3f6ee] opacity-35'
              : selected
                ? 'border-primary-500 bg-primary-50'
                : 'border-transparent bg-white shadow-card'
          } ${shaking ? 'animate-shake border-danger-500' : ''}`}
        >
          {isMatched && <Check aria-label={ru.a11y.correctIcon} className="text-success-600 size-4 shrink-0" strokeWidth={3} />}
          <span className="min-w-0">{s.text}</span>
        </button>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="glass rounded-[22px] px-4 py-3 text-center">
        <p className="font-semibold">{allDone ? ru.session.pairsDone : ru.session.pairsTitle}</p>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <ul className="flex flex-col gap-2.5" aria-label={ru.session.pairsLeft}>
          {left.map((s) => cell('l', s))}
        </ul>
        <ul className="flex flex-col gap-2.5" aria-label={ru.session.pairsRight}>
          {right.map((s) => cell('r', s))}
        </ul>
      </div>
    </div>
  );
}
