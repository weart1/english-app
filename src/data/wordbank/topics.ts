import type { BankTopic } from './types';

/** Topic catalogue. Kept separate from the (large, lazily loaded) data. */
export const WORD_TOPICS: readonly BankTopic[] = [
  { key: 'everyday', label: 'Повседневное', kind: 'word' },
  { key: 'people', label: 'Люди и отношения', kind: 'word' },
  { key: 'home', label: 'Дом и быт', kind: 'word' },
  { key: 'food', label: 'Еда и напитки', kind: 'word' },
  { key: 'travel', label: 'Путешествия', kind: 'word' },
  { key: 'city', label: 'Город и транспорт', kind: 'word' },
  { key: 'work', label: 'Работа и карьера', kind: 'word' },
  { key: 'business', label: 'Бизнес и финансы', kind: 'word' },
  { key: 'tech', label: 'IT и технологии', kind: 'word' },
  { key: 'health', label: 'Здоровье и тело', kind: 'word' },
  { key: 'feelings', label: 'Чувства и характер', kind: 'word' },
  { key: 'nature', label: 'Природа и погода', kind: 'word' },
  { key: 'education', label: 'Учёба и наука', kind: 'word' },
  { key: 'culture', label: 'Культура, медиа, спорт', kind: 'word' },
  { key: 'society', label: 'Общество и право', kind: 'word' },
  { key: 'academic', label: 'Продвинутая лексика', kind: 'word' },
];

export const PHRASE_TOPICS: readonly BankTopic[] = [
  { key: 'phrasal', label: 'Фразовые глаголы', kind: 'phrase' },
  { key: 'idioms', label: 'Идиомы', kind: 'phrase' },
  { key: 'conversation', label: 'Разговорные фразы', kind: 'phrase' },
  { key: 'businessPhrases', label: 'Деловой английский', kind: 'phrase' },
  { key: 'travelPhrases', label: 'Фразы в поездке', kind: 'phrase' },
  { key: 'collocations', label: 'Устойчивые сочетания', kind: 'phrase' },
];

export const ALL_TOPICS: readonly BankTopic[] = [...WORD_TOPICS, ...PHRASE_TOPICS];

export function topicByKey(key: string): BankTopic | undefined {
  return ALL_TOPICS.find((t) => t.key === key);
}
