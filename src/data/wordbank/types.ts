export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
export const CEFR_LEVELS: readonly CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];

export type BankKind = 'word' | 'phrase';

export interface BankTopic {
  key: string;
  /** Russian label; also used as the tag name when an item is added. */
  label: string;
  kind: BankKind;
}

export interface BankItem {
  /** Stable id derived from kind + normalized term. */
  id: string;
  kind: BankKind;
  term: string;
  translations: string[];
  level: CefrLevel;
  topic: string;
  example?: string;
}
