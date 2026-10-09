import { TypingBody } from './TypingBody';
import { answersFor, promptFor, PromptCard, useAutoSpeak, type CardModeProps } from './shared';
import { ru } from '@/i18n/ru';

/** Написание: see the prompt, type the answer. */
export function Typing({ item, word, autoPlay, interacted, onAnswer }: CardModeProps) {
  const prompt = promptFor(word, item.direction);
  const ans = answersFor(word, item.direction);
  useAutoSpeak(prompt.lang === 'en' ? word.term : null, autoPlay && interacted, item.uid);
  return (
    <TypingBody
      itemKey={item.uid}
      mode="typing"
      prompt={<PromptCard prompt={prompt} word={word} label={ru.session.translate} />}
      accepted={ans.accepted}
      lang={ans.lang}
      hintSource={ans.accepted[0] ?? ''}
      displayAnswer={ans.display}
      onAnswer={onAnswer}
    />
  );
}
