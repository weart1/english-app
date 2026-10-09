import { useEffect, useRef, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import type { ConcreteMode, Direction, Grade, QueueItem, ReviewCard, Word } from '@/db/types';
import type { AnswerLang } from '@/lib/answerCheck';
import { useSpeech } from '@/hooks/useSpeech';
import { SpeakButton } from '@/components/SpeakButton';

export interface ModeResult {
  grade: Grade;
  wasCorrect: boolean;
  responseMs: number;
  /** The concrete mode actually used (a mode can fall back, e.g. to flashcards). */
  mode?: ConcreteMode;
}

export interface CardModeProps {
  item: QueueItem;
  word: Word;
  card: ReviewCard;
  allWords: readonly Word[];
  dayStartsAtHour: number;
  practiceOnly: boolean;
  /** Session option "Автоозвучка". */
  autoPlay: boolean;
  /** The user has tapped in this session (iOS only allows speech after a gesture). */
  interacted: boolean;
  onAnswer: (r: ModeResult) => void;
}

export interface Prompt {
  text: string;
  lang: AnswerLang;
  transcription?: string;
}

/** What is shown as the question for a direction. */
export function promptFor(word: Word, direction: Direction): Prompt {
  return direction === 'en_ru'
    ? { text: word.term, lang: 'en', transcription: word.transcription }
    : { text: word.translations.join(', '), lang: 'ru' };
}

/** What counts as a correct typed answer for a direction. */
export function answersFor(word: Word, direction: Direction): { accepted: string[]; lang: AnswerLang; display: string } {
  return direction === 'en_ru'
    ? { accepted: word.translations, lang: 'ru', display: word.translations.join(', ') }
    : { accepted: [word.term], lang: 'en', display: word.term };
}

/** Milliseconds since the current item appeared. */
export function useResponseTimer(key: string) {
  const start = useRef(performance.now());
  const lastKey = useRef(key);
  if (lastKey.current !== key) {
    lastKey.current = key;
    start.current = performance.now();
  }
  return () => Math.round(performance.now() - start.current);
}

/** Speaks `text` once per `key` when allowed (never on page load without a gesture). */
export function useAutoSpeak(text: string | null, enabled: boolean, key: string) {
  const { speak, supported } = useSpeech();
  const spokenFor = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || !supported || !text || spokenFor.current === key) return;
    spokenFor.current = key;
    const t = window.setTimeout(() => speak(text), 150);
    return () => window.clearTimeout(t);
  }, [enabled, supported, text, key, speak]);
}

/** Font size that shrinks for long words/phrases so they never overflow. */
export function fitTextClass(text: string, base: 'xl' | 'lg' = 'xl'): string {
  const len = text.length;
  if (base === 'lg') {
    if (len <= 14) return 'text-[1.6rem] leading-tight';
    if (len <= 28) return 'text-[1.35rem] leading-snug';
    return 'text-[1.1rem] leading-snug';
  }
  if (len <= 10) return 'text-word';
  if (len <= 18) return 'text-[1.9rem] leading-tight';
  if (len <= 32) return 'text-[1.5rem] leading-snug';
  return 'text-[1.2rem] leading-snug';
}

export function PromptText({ prompt, size = 'xl' }: { prompt: Prompt; size?: 'xl' | 'lg' }) {
  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <p
        lang={prompt.lang}
        className={`max-w-full font-semibold [overflow-wrap:anywhere] break-words hyphens-auto ${fitTextClass(prompt.text, size)}`}
      >
        {prompt.text}
      </p>
      {prompt.transcription && <p className="text-muted-glass mt-1.5">{prompt.transcription}</p>}
    </div>
  );
}

/** Glass card with the question; English prompts get a 🔊 button. */
export function PromptCard({
  prompt,
  word,
  label,
  children,
  speakText,
}: {
  prompt: Prompt;
  word: Word;
  label?: string;
  children?: ReactNode;
  speakText?: string;
}) {
  return (
    <div className="glass relative flex min-h-[188px] flex-col items-center justify-center gap-3 rounded-[26px] px-5 py-7">
      {label && <p className="text-muted-glass text-caption font-semibold tracking-wide uppercase">{label}</p>}
      <PromptText prompt={prompt} />
      {prompt.lang === 'en' && <SpeakButton text={speakText ?? word.term} className="mt-1" />}
      {children}
    </div>
  );
}

export function FeedbackLine({ kind, children }: { kind: 'correct' | 'almost' | 'wrong'; children: ReactNode }) {
  const tone =
    kind === 'correct'
      ? 'bg-[#e3f6ee] text-success-600'
      : kind === 'almost'
        ? 'bg-accent-100 text-accent-700'
        : 'bg-[#fdecec] text-danger-600';
  return (
    <div role="status" aria-live="assertive" className={`animate-fade-in flex items-start gap-2 rounded-[16px] px-4 py-3 font-semibold ${tone}`}>
      <span aria-hidden="true" className="mt-0.5 shrink-0">
        {kind === 'wrong' ? <X className="size-5" strokeWidth={3} /> : <Check className="size-5" strokeWidth={3} />}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Prevent buttons from stealing focus from the answer input (keeps the iOS keyboard open). */
export const keepFocus = {
  onPointerDown: (e: PointerEvent) => e.preventDefault(),
  onMouseDown: (e: MouseEvent) => e.preventDefault(),
};
