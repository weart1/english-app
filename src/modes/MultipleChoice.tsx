import { useMemo } from 'react';
import { ChoiceBody } from './ChoiceBody';
import { Flashcard } from './Flashcard';
import { promptFor, PromptCard, useAutoSpeak, type CardModeProps } from './shared';
import { buildOptions } from '@/lib/distractors';
import { hashString, mulberry32 } from '@/lib/random';
import { ru } from '@/i18n/ru';

/** Выбор ответа: prompt + 4 options. */
export function MultipleChoice(props: CardModeProps) {
  const { item, word, allWords, autoPlay, interacted, onAnswer } = props;
  const prompt = promptFor(word, item.direction);
  const options = useMemo(
    () => buildOptions(word, allWords, item.direction, mulberry32(hashString(item.uid))),
    [word, allWords, item.direction, item.uid],
  );
  useAutoSpeak(prompt.lang === 'en' ? word.term : null, autoPlay && interacted, item.uid);
  if (options.length < 2) return <Flashcard {...props} />;
  return (
    <ChoiceBody
      itemKey={item.uid}
      mode="choice"
      prompt={<PromptCard prompt={prompt} word={word} label={ru.session.chooseTranslation} />}
      options={options}
      lang={item.direction === 'en_ru' ? 'ru' : 'en'}
      onAnswer={onAnswer}
    />
  );
}
