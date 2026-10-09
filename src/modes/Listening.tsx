import { useMemo } from 'react';
import { Snail, Volume2 } from 'lucide-react';
import { ChoiceBody } from './ChoiceBody';
import { TypingBody } from './TypingBody';
import { Flashcard } from './Flashcard';
import { useAutoSpeak, type CardModeProps } from './shared';
import { useSpeech } from '@/hooks/useSpeech';
import { buildOptions } from '@/lib/distractors';
import { hashString, mulberry32 } from '@/lib/random';
import { ru } from '@/i18n/ru';

export const SLOW_RATE = 0.6;

/**
 * Аудирование: the English word is spoken. EN→RU cards: pick the translation;
 * RU→EN cards: type the word you heard.
 */
export function Listening(props: CardModeProps) {
  const { item, word, allWords, interacted, onAnswer } = props;
  const { supported, speak } = useSpeech();
  const options = useMemo(
    () => buildOptions(word, allWords, 'en_ru', mulberry32(hashString(item.uid))),
    [word, allWords, item.uid],
  );
  // The word is always spoken automatically, but only after a tap in this session (iOS rule).
  useAutoSpeak(word.term, interacted, item.uid);

  if (!supported) return <Flashcard {...props} />;

  const audioPrompt = (
    <div className="glass flex flex-col items-center gap-4 rounded-[26px] px-5 py-7">
      <p className="text-muted-glass text-caption font-semibold tracking-wide uppercase">
        {item.direction === 'en_ru' ? ru.session.listenPrompt : ru.session.typeWhatYouHear}
      </p>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => speak(word.term)}
          aria-label={ru.session.repeat}
          className="bg-primary-500 flex size-20 items-center justify-center rounded-full text-white shadow-[0_10px_24px_rgba(47,107,255,0.35)] active:scale-95"
        >
          <Volume2 aria-hidden="true" className="size-9" />
        </button>
        <button
          type="button"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => speak(word.term, { rate: SLOW_RATE })}
          aria-label={ru.session.slow}
          className="bg-primary-100 text-primary-600 flex size-14 items-center justify-center rounded-full active:scale-95"
        >
          <Snail aria-hidden="true" className="size-6" />
        </button>
      </div>
      {!interacted && <p className="text-muted-glass text-caption">{ru.session.listenTapToPlay}</p>}
    </div>
  );

  if (item.direction === 'en_ru' && options.length >= 2) {
    return <ChoiceBody itemKey={item.uid} mode="listening" prompt={audioPrompt} options={options} lang="ru" onAnswer={onAnswer} />;
  }
  const typeTranslation = item.direction === 'en_ru';
  return (
    <TypingBody
      itemKey={item.uid}
      mode="listening"
      prompt={audioPrompt}
      accepted={typeTranslation ? word.translations : [word.term]}
      lang={typeTranslation ? 'ru' : 'en'}
      hintSource={(typeTranslation ? word.translations[0] : word.term) ?? ''}
      displayAnswer={typeTranslation ? word.translations.join(', ') : word.term}
      reveal={
        <p className="text-muted px-1" lang="en">
          {word.term}
          {word.transcription ? ` · ${word.transcription}` : ''} — <span lang="ru">{word.translations.join(', ')}</span>
        </p>
      }
      onAnswer={onAnswer}
    />
  );
}
