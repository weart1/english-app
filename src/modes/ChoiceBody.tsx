import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Check, X } from 'lucide-react';
import type { ConcreteMode } from '@/db/types';
import type { ChoiceOption } from '@/lib/distractors';
import type { AnswerLang } from '@/lib/answerCheck';
import { autoGrade } from '@/lib/srs';
import { Button } from '@/components/Button';
import type { ModeResult } from './shared';
import { ru } from '@/i18n/ru';

export const AUTO_ADVANCE_MS = 1200;

interface ChoiceBodyProps {
  itemKey: string;
  mode: ConcreteMode;
  prompt: ReactNode;
  options: ChoiceOption[];
  lang: AnswerLang;
  onAnswer: (r: ModeResult) => void;
}

/** Four options; correct turns green, a wrong pick red (with ✓/✕ icons, not colour alone). */
export function ChoiceBody({ itemKey, mode, prompt, options, lang, onAnswer }: ChoiceBodyProps) {
  const [chosen, setChosen] = useState<number | null>(null);
  const [key, setKey] = useState(itemKey);
  const started = useRef(performance.now());
  const answerMs = useRef(0);
  const done = useRef(false);

  if (key !== itemKey) {
    setKey(itemKey);
    setChosen(null);
  }

  useEffect(() => {
    started.current = performance.now();
    done.current = false;
  }, [itemKey]);

  const finish = (index: number) => {
    if (done.current) return;
    done.current = true;
    const correct = options[index]?.correct ?? false;
    onAnswer({ ...autoGrade({ correct, responseMs: answerMs.current }), responseMs: answerMs.current, mode });
  };

  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    if (chosen === null) return;
    const t = window.setTimeout(() => finishRef.current(chosen), AUTO_ADVANCE_MS);
    return () => window.clearTimeout(t);
  }, [chosen]);

  const choose = (i: number) => {
    if (chosen !== null) {
      finish(chosen);
      return;
    }
    answerMs.current = performance.now() - started.current;
    setChosen(i);
  };

  return (
    <div className="flex flex-col gap-4">
      {prompt}
      <ul className="flex flex-col gap-2.5" aria-label={ru.session.chooseTranslation}>
        {options.map((o, i) => {
          const answered = chosen !== null;
          const isChosen = chosen === i;
          const state = !answered ? 'idle' : o.correct ? 'correct' : isChosen ? 'wrong' : 'dim';
          return (
            <li key={`${itemKey}-${o.wordId}`}>
              <button
                type="button"
                lang={lang}
                onClick={() => choose(i)}
                aria-pressed={isChosen}
                className={`flex min-h-14 w-full items-center gap-3 rounded-[18px] border-2 px-4 py-3 text-left text-[1.06rem] font-medium transition-colors ${
                  state === 'idle'
                    ? 'active:bg-primary-50 border-transparent bg-white shadow-card'
                    : state === 'correct'
                      ? 'border-success-500 animate-glow bg-[#e3f6ee]'
                      : state === 'wrong'
                        ? 'border-danger-500 animate-shake bg-[#fdecec]'
                        : 'border-transparent bg-white/70 opacity-60'
                }`}
              >
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{o.text}</span>
                {state === 'correct' && <Check aria-label={ru.a11y.correctIcon} className="text-success-600 size-6 shrink-0" strokeWidth={3} />}
                {state === 'wrong' && <X aria-label={ru.a11y.wrongIcon} className="text-danger-600 size-6 shrink-0" strokeWidth={3} />}
              </button>
            </li>
          );
        })}
      </ul>
      {chosen !== null && (
        <Button size="lg" block onClick={() => finish(chosen)} icon={<ArrowRight aria-hidden="true" className="size-5" />}>
          {ru.common.next}
        </Button>
      )}
    </div>
  );
}
