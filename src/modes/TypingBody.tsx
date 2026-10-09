import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Lightbulb } from 'lucide-react';
import type { ConcreteMode } from '@/db/types';
import { checkAnswer, diffAnswer, type AnswerLang, type CheckResult } from '@/lib/answerCheck';
import { autoGrade } from '@/lib/srs';
import { Button } from '@/components/Button';
import { FeedbackLine, keepFocus, type ModeResult } from './shared';
import { ru } from '@/i18n/ru';

export interface TypingBodyProps {
  itemKey: string;
  mode: ConcreteMode;
  prompt: ReactNode;
  accepted: string[];
  lang: AnswerLang;
  /** Revealed letter by letter by the hint button. */
  hintSource: string;
  /** Correct answer as shown to the user. */
  displayAnswer: string;
  /** Custom checker (cloze accepts the base form as a typo). */
  check?: (input: string) => CheckResult;
  /** Extra content shown after answering (e.g. the full sentence). */
  reveal?: ReactNode;
  onAnswer: (r: ModeResult) => void;
}

interface State {
  key: string;
  value: string;
  hints: number;
  result: CheckResult | null;
  gaveUp: boolean;
  answerMs: number;
  submitted: boolean;
}

const fresh = (key: string): State => ({ key, value: '', hints: 0, result: null, gaveUp: false, answerMs: 0, submitted: false });

/**
 * Shared "type the answer" UI (Написание, Аудирование, Пропуск в предложении).
 * The input stays mounted between cards so the iOS keyboard does not close.
 */
export function TypingBody(props: TypingBodyProps) {
  const { itemKey, prompt, accepted, lang, hintSource, displayAnswer, check, reveal, onAnswer, mode } = props;
  const [st, setSt] = useState<State>(() => fresh(itemKey));
  const inputRef = useRef<HTMLInputElement>(null);
  const started = useRef(performance.now());

  if (st.key !== itemKey) {
    // New card: reset during render (React-recommended pattern), keep the same <input>.
    setSt(fresh(itemKey));
  }

  useEffect(() => {
    started.current = performance.now();
    // Works on desktop / after a tap; iOS ignores programmatic focus without a gesture.
    inputRef.current?.focus({ preventScroll: true });
  }, [itemKey]);

  const evaluate = () => {
    if (st.result) return;
    if (!st.value.trim()) {
      inputRef.current?.focus();
      return;
    }
    const res = check ? check(st.value) : checkAnswer(st.value, accepted, lang);
    setSt((s) => ({ ...s, result: res, answerMs: performance.now() - started.current }));
  };

  const giveUp = () => {
    if (st.result) return;
    setSt((s) => ({
      ...s,
      gaveUp: true,
      result: { verdict: 'wrong', expected: displayAnswer, distance: Infinity },
      answerMs: performance.now() - started.current,
    }));
  };

  const hint = () => {
    if (st.result) return;
    const n = Math.min(hintSource.length, st.hints + 1);
    setSt((s) => ({ ...s, hints: n, value: hintSource.slice(0, n) }));
    inputRef.current?.focus();
  };

  const next = () => {
    if (!st.result || st.submitted) return;
    setSt((s) => ({ ...s, submitted: true }));
    const g = st.gaveUp
      ? { grade: 0 as const, wasCorrect: false }
      : autoGrade({
          correct: st.result.verdict !== 'wrong',
          typo: st.result.verdict === 'typo',
          responseMs: st.answerMs,
          hintsUsed: st.hints,
        });
    onAnswer({ ...g, responseMs: st.answerMs, mode });
  };

  const verdict = st.result?.verdict;
  const diff = st.result && verdict === 'wrong' && !st.gaveUp ? diffAnswer(st.value, st.result.expected || displayAnswer) : null;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (st.result) next();
        else evaluate();
      }}
    >
      {prompt}

      <div
        key={`${itemKey}-${verdict ?? 'none'}`}
        className={`rounded-[18px] ${verdict === 'wrong' ? 'animate-shake' : verdict === 'correct' ? 'animate-glow' : ''}`}
      >
        <label className="sr-only" htmlFor="answer-input">
          {ru.session.yourAnswer}
        </label>
        <input
          ref={inputRef}
          id="answer-input"
          lang={lang}
          value={st.value}
          readOnly={!!st.result}
          onChange={(e) => setSt((s) => ({ ...s, value: e.target.value }))}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
          enterKeyHint={st.result ? 'next' : 'done'}
          placeholder={lang === 'en' ? ru.session.answerPlaceholderEn : ru.session.answerPlaceholderRu}
          aria-invalid={verdict === 'wrong'}
          className={`min-h-14 w-full rounded-[18px] border-2 bg-white px-4 text-[1.15rem] font-medium outline-none transition-colors ${
            verdict === 'wrong'
              ? 'border-danger-500'
              : verdict === 'correct'
                ? 'border-success-500'
                : verdict === 'typo'
                  ? 'border-warning-500'
                  : 'focus:border-primary-500 border-[#dfe6f3]'
          }`}
        />
      </div>

      {st.result && (
        <div className="flex flex-col gap-3">
          {verdict === 'correct' && <FeedbackLine kind="correct">{ru.session.correct}</FeedbackLine>}
          {verdict === 'typo' && <FeedbackLine kind="almost">{ru.session.almost(st.result.expected)}</FeedbackLine>}
          {verdict === 'wrong' && (
            <FeedbackLine kind="wrong">
              <p>{ru.session.wrong}</p>
              <p className="text-strong mt-1 font-normal">
                {ru.session.correctAnswerIs}:{' '}
                <span lang={lang} className="font-semibold">
                  {diff
                    ? diff.expected.map((seg, i) =>
                        seg.ok ? (
                          <span key={i}>{seg.text}</span>
                        ) : (
                          <mark key={i} className="text-danger-600 rounded bg-[#fdecec] underline decoration-2 underline-offset-2">
                            {seg.text}
                          </mark>
                        ),
                      )
                    : displayAnswer}
                </span>
              </p>
              {diff && (
                <p className="text-muted mt-1 font-normal">
                  {ru.session.yourAnswer}:{' '}
                  <span lang={lang}>
                    {diff.input.map((seg, i) =>
                      seg.ok ? (
                        <span key={i}>{seg.text}</span>
                      ) : (
                        <s key={i} className="text-danger-600">
                          {seg.text}
                        </s>
                      ),
                    )}
                  </span>
                </p>
              )}
            </FeedbackLine>
          )}
          {verdict !== 'wrong' && accepted.length > 1 && (
            <p className="text-muted px-1 text-[0.9rem]" lang={lang}>
              {displayAnswer}
            </p>
          )}
          {reveal}
        </div>
      )}

      {st.result ? (
        <Button type="submit" size="lg" block {...keepFocus} icon={<ArrowRight aria-hidden="true" className="size-5" />}>
          {ru.common.next}
        </Button>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            {...keepFocus}
            onClick={hint}
            disabled={st.hints >= hintSource.length}
            aria-label={st.hints ? `${ru.session.hint}. ${ru.session.hintsUsed(st.hints)}` : ru.session.hint}
            title={ru.session.hint}
            className="text-accent-700 relative flex size-11 shrink-0 items-center justify-center rounded-[15px] bg-white shadow-card disabled:opacity-40"
          >
            <Lightbulb aria-hidden="true" className="size-5" />
            {st.hints > 0 && (
              <span aria-hidden="true" className="bg-accent-400 text-strong absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full text-[0.7rem] font-bold">
                {st.hints}
              </span>
            )}
          </button>
          <Button type="button" variant="secondary" {...keepFocus} onClick={giveUp}>
            {ru.session.dontKnow}
          </Button>
          <Button type="submit" block {...keepFocus}>
            {ru.session.check}
          </Button>
        </div>
      )}
    </form>
  );
}
