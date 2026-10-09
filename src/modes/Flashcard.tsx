import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { animate, m, useDragControls, useMotionValue, useReducedMotion, useTransform, type PanInfo } from 'motion/react';
import { Check, X } from 'lucide-react';
import type { Grade } from '@/db/types';
import { scheduler } from '@/lib/srs';
import { formatPreview } from '@/lib/format';
import { Button } from '@/components/Button';
import { SpeakButton } from '@/components/SpeakButton';
import { answersFor, promptFor, PromptText, useAutoSpeak, type CardModeProps } from './shared';
import { ru } from '@/i18n/ru';

const SWIPE_THRESHOLD = 110;
const EDGE_GUARD_PX = 20;

const GRADE_BUTTONS: { grade: Grade; label: string; className: string }[] = [
  { grade: 0, label: ru.session.again, className: 'bg-danger-600 text-white' },
  { grade: 1, label: ru.session.hard, className: 'bg-warning-500 text-strong' },
  { grade: 2, label: ru.session.good, className: 'bg-primary-500 text-white' },
  { grade: 3, label: ru.session.easy, className: 'bg-accent-400 text-strong' },
];

/**
 * Карточки: tap to flip, then self-grade. Swipe right = Хорошо, left = Не помню
 * (swipes starting within 20px of the screen edge are ignored).
 */
export function Flashcard({ item, word, card, dayStartsAtHour, practiceOnly, autoPlay, interacted, onAnswer }: CardModeProps) {
  const reduceMotion = useReducedMotion();
  const [flipped, setFlipped] = useState(false);
  const answered = useRef(false);
  const started = useRef(performance.now());
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-240, 240], [-10, 10]);
  const goodOpacity = useTransform(x, [20, SWIPE_THRESHOLD], [0, 0.85]);
  const againOpacity = useTransform(x, [-SWIPE_THRESHOLD, -20], [0.85, 0]);
  const dragControls = useDragControls();

  const prompt = promptFor(word, item.direction);
  const answer = answersFor(word, item.direction);
  const previews = useMemo(() => scheduler.preview(card, { now: new Date(), dayStartsAtHour }), [card, dayStartsAtHour]);

  useAutoSpeak(item.direction === 'en_ru' ? word.term : null, autoPlay && interacted, `${item.uid}-front`);
  useAutoSpeak(item.direction === 'ru_en' && flipped ? word.term : null, autoPlay && interacted, `${item.uid}-back`);

  const grade = (g: Grade) => {
    if (answered.current) return;
    answered.current = true;
    onAnswer({ grade: g, wasCorrect: g > 0, responseMs: performance.now() - started.current, mode: 'flashcards' });
  };

  const flyOut = (g: Grade, dir: 1 | -1) => {
    if (answered.current) return;
    void animate(x, dir * window.innerWidth * 1.2, { duration: reduceMotion ? 0.01 : 0.22, ease: 'easeIn' }).then(() => grade(g));
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > SWIPE_THRESHOLD || info.velocity.x > 700) flyOut(2, 1);
    else if (info.offset.x < -SWIPE_THRESHOLD || info.velocity.x < -700) flyOut(0, -1);
    else void animate(x, 0, { type: 'spring', stiffness: 500, damping: 35 });
  };

  const onPointerDown = (e: PointerEvent) => {
    // Leave the screen edges to the system (back gestures, notification centre).
    if (e.clientX < EDGE_GUARD_PX || e.clientX > window.innerWidth - EDGE_GUARD_PX) return;
    dragControls.start(e);
  };

  // Desktop / hardware keyboard shortcuts: Space flips, 1–4 grade.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setFlipped(true);
      } else if (flipped && ['1', '2', '3', '4'].includes(e.key)) {
        grade((Number(e.key) - 1) as Grade);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const front = (
    <Face>
      <p className="text-muted-glass text-caption font-semibold tracking-wide uppercase">{ru.session.translate}</p>
      <PromptText prompt={prompt} />
      {prompt.lang === 'en' && <SpeakButton text={word.term} />}
      <p className="text-muted-glass text-caption mt-2">{ru.session.tapToFlip}</p>
    </Face>
  );

  const back = (
    <Face>
      <p lang={prompt.lang} className="text-muted-glass text-center [overflow-wrap:anywhere]">
        {prompt.text}
      </p>
      <PromptText prompt={{ text: answer.display, lang: answer.lang, transcription: item.direction === 'ru_en' ? word.transcription : undefined }} />
      <SpeakButton text={word.term} />
      {word.examples.length > 0 && (
        <ul className="mt-1 flex w-full flex-col gap-1.5 text-center">
          {word.examples.slice(0, 2).map((ex) => (
            <li key={ex} lang="en" className="text-muted-glass text-[0.95rem] italic [overflow-wrap:anywhere]">
              {ex}
            </li>
          ))}
        </ul>
      )}
    </Face>
  );

  return (
    <div className="flex flex-col gap-4">
      <m.div
        drag="x"
        dragControls={dragControls}
        dragListener={false}
        dragElastic={0.9}
        dragMomentum={false}
        onDragEnd={onDragEnd}
        onPointerDown={onPointerDown}
        style={{ x, rotate, touchAction: 'pan-y' }}
        className="relative cursor-grab"
      >
        {/* Tap anywhere on the card to flip; the "Показать ответ" button below is the accessible control. */}
        <div onClick={() => setFlipped(true)} className="no-select block w-full [perspective:1200px]">
          {reduceMotion ? (
            <div key={flipped ? 'back' : 'front'} className="animate-fade-in">
              {flipped ? back : front}
            </div>
          ) : (
            <m.div
              className="grid [transform-style:preserve-3d]"
              initial={false}
              animate={{ rotateY: flipped ? 180 : 0 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            >
              <div className="[grid-area:1/1] [backface-visibility:hidden] [-webkit-backface-visibility:hidden]" aria-hidden={flipped}>
                {front}
              </div>
              <div
                className="[grid-area:1/1] [transform:rotateY(180deg)] [backface-visibility:hidden] [-webkit-backface-visibility:hidden]"
                aria-hidden={!flipped}
              >
                {back}
              </div>
            </m.div>
          )}
        </div>
        <m.div
          aria-hidden="true"
          style={{ opacity: goodOpacity }}
          className="bg-success-500/80 pointer-events-none absolute inset-0 flex items-center justify-center gap-2 rounded-[26px] text-xl font-bold text-white"
        >
          <Check className="size-7" strokeWidth={3} /> {ru.session.good}
        </m.div>
        <m.div
          aria-hidden="true"
          style={{ opacity: againOpacity }}
          className="bg-danger-500/80 pointer-events-none absolute inset-0 flex items-center justify-center gap-2 rounded-[26px] text-xl font-bold text-white"
        >
          <X className="size-7" strokeWidth={3} /> {ru.session.again}
        </m.div>
      </m.div>

      {flipped ? (
        <div className="grid grid-cols-4 gap-2" role="group" aria-label={ru.session.swipeHint}>
          {GRADE_BUTTONS.map((b) => (
            <button
              key={b.grade}
              type="button"
              onClick={() => grade(b.grade)}
              className={`flex min-h-16 flex-col items-center justify-center rounded-[16px] px-1 py-2 text-[0.85rem] leading-tight font-semibold shadow-card active:scale-[0.97] ${b.className}`}
            >
              <span>{b.label}</span>
              {!practiceOnly && <span className="mt-0.5 text-[0.75rem] font-medium opacity-90">{formatPreview(previews[b.grade])}</span>}
            </button>
          ))}
        </div>
      ) : (
        <Button size="lg" block onClick={() => setFlipped(true)}>
          {ru.session.showAnswer}
        </Button>
      )}
      <p className="text-muted text-caption text-center">{ru.session.swipeHint}</p>
    </div>
  );
}

function Face({ children }: { children: ReactNode }) {
  return (
    <div
      className="glass flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-[26px] px-5 py-7"
      style={{ background: 'rgba(255,255,255,0.72)' }}
    >
      {children}
    </div>
  );
}
