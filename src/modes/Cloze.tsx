import { useMemo } from 'react';
import { TypingBody } from './TypingBody';
import { Flashcard } from './Flashcard';
import type { CardModeProps } from './shared';
import { clozeFor } from '@/lib/cloze';
import { checkAnswer, normalizeAnswer } from '@/lib/answerCheck';
import { ru } from '@/i18n/ru';

/** Пропуск в предложении: type the word missing from an example sentence. */
export function Cloze(props: CardModeProps) {
  const { item, word, onAnswer } = props;
  const match = useMemo(() => clozeFor(word), [word]);
  if (!match) return <Flashcard {...props} />;

  const check = (input: string) => {
    const res = checkAnswer(input, [match.answer], 'en');
    // Typing the dictionary form instead of the inflected one is "almost".
    if (res.verdict === 'wrong' && normalizeAnswer(input) === normalizeAnswer(word.term)) {
      return { verdict: 'typo' as const, expected: match.answer, distance: 1 };
    }
    return res;
  };

  const sentence = (filled: boolean) => (
    <p lang="en" className="text-[1.2rem] leading-relaxed [overflow-wrap:anywhere]">
      {match.before}
      {filled ? (
        <mark className="text-primary-600 rounded-md bg-primary-100 px-1 font-semibold">{match.answer}</mark>
      ) : (
        <span aria-label="пропуск" className="border-primary-500 mx-0.5 inline-block min-w-[4.5rem] border-b-2 align-baseline">
          &nbsp;
        </span>
      )}
      {match.after}
    </p>
  );

  return (
    <TypingBody
      itemKey={item.uid}
      mode="cloze"
      prompt={
        <div className="glass flex flex-col gap-3 rounded-[26px] px-5 py-6">
          <p className="text-muted-glass text-caption font-semibold tracking-wide uppercase">{ru.session.fillBlank}</p>
          {sentence(false)}
          <p lang="ru" className="text-muted-glass">
            {ru.session.clozeHint(word.translations.join(', '))}
          </p>
        </div>
      }
      accepted={[match.answer]}
      lang="en"
      hintSource={match.answer}
      displayAnswer={match.answer}
      check={check}
      reveal={<div className="rounded-[16px] bg-white px-4 py-3 shadow-card">{sentence(true)}</div>}
      onAnswer={onAnswer}
    />
  );
}
