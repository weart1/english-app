import type { BankItem } from './types';
import { dedupe, parseBankLines } from './parse';
import w_everyday from './words/everyday';
import w_people from './words/people';
import w_home from './words/home';
import w_food from './words/food';
import w_travel from './words/travel';
import w_city from './words/city';
import w_work from './words/work';
import w_business from './words/business';
import w_tech from './words/tech';
import w_health from './words/health';
import w_feelings from './words/feelings';
import w_nature from './words/nature';
import w_education from './words/education';
import w_culture from './words/culture';
import w_society from './words/society';
import w_academic from './words/academic';
import p_phrasal from './phrases/phrasal';
import p_idioms from './phrases/idioms';
import p_conversation from './phrases/conversation';
import p_businessPhrases from './phrases/businessPhrases';
import p_travelPhrases from './phrases/travelPhrases';
import p_collocations from './phrases/collocations';

const RAW: [string, 'word' | 'phrase', string][] = [
  ['everyday', 'word', w_everyday],
  ['people', 'word', w_people],
  ['home', 'word', w_home],
  ['food', 'word', w_food],
  ['travel', 'word', w_travel],
  ['city', 'word', w_city],
  ['work', 'word', w_work],
  ['business', 'word', w_business],
  ['tech', 'word', w_tech],
  ['health', 'word', w_health],
  ['feelings', 'word', w_feelings],
  ['nature', 'word', w_nature],
  ['education', 'word', w_education],
  ['culture', 'word', w_culture],
  ['society', 'word', w_society],
  ['academic', 'word', w_academic],
  ['phrasal', 'phrase', p_phrasal],
  ['idioms', 'phrase', p_idioms],
  ['conversation', 'phrase', p_conversation],
  ['businessPhrases', 'phrase', p_businessPhrases],
  ['travelPhrases', 'phrase', p_travelPhrases],
  ['collocations', 'phrase', p_collocations],
];

let cache: BankItem[] | null = null;

/** The whole built-in dictionary (parsed once). This module is loaded lazily. */
export function getBank(): BankItem[] {
  if (!cache) cache = dedupe(RAW.flatMap(([topic, kind, raw]) => parseBankLines(raw, topic, kind)));
  return cache;
}
