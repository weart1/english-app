/**
 * Optional, network-dependent autofill. Swappable behind DictionaryProvider.
 * Saving a word never depends on this.
 */
import { z } from 'zod';

export interface DictionaryResult {
  transcription?: string;
  examples: string[];
}

export interface DictionaryProvider {
  /** Resolves to null when the word is not in the dictionary. */
  lookup(term: string, signal: AbortSignal): Promise<DictionaryResult | null>;
}

/** Russian translation autofill is out of scope for v1 — interface stub only. */
export interface TranslationProvider {
  translate(term: string, signal: AbortSignal): Promise<string[]>;
}

export const nullTranslationProvider: TranslationProvider = {
  translate: () => Promise.resolve([]),
};

export type DictionaryErrorKind = 'offline' | 'timeout' | 'network' | 'invalid';

export class DictionaryError extends Error {
  constructor(public readonly kind: DictionaryErrorKind) {
    super(kind);
    this.name = 'DictionaryError';
  }
}

const definitionSchema = z.object({ example: z.string().optional() });
const entrySchema = z.object({
  word: z.string(),
  phonetic: z.string().optional(),
  phonetics: z.array(z.object({ text: z.string().optional() })).default([]),
  meanings: z.array(z.object({ definitions: z.array(definitionSchema).default([]) })).default([]),
});
export const dictionaryResponseSchema = z.array(entrySchema).min(1);

export function parseDictionaryResponse(json: unknown): DictionaryResult {
  const parsed = dictionaryResponseSchema.safeParse(json);
  if (!parsed.success) throw new DictionaryError('invalid');
  const entries = parsed.data;
  const transcription =
    entries.map((e) => e.phonetic).find((p): p is string => !!p?.trim()) ??
    entries.flatMap((e) => e.phonetics.map((p) => p.text)).find((t): t is string => !!t?.trim());
  const examples: string[] = [];
  for (const e of entries) {
    for (const m of e.meanings) {
      for (const d of m.definitions) {
        const ex = d.example?.trim();
        if (ex && !examples.includes(ex)) examples.push(ex);
      }
    }
  }
  return { transcription: transcription?.trim(), examples };
}

export const freeDictionaryProvider: DictionaryProvider = {
  async lookup(term, signal) {
    const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term.trim().toLowerCase())}`;
    let res: Response;
    try {
      res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    } catch (e) {
      if (signal.aborted) throw new DictionaryError('timeout');
      throw new DictionaryError(navigator.onLine === false ? 'offline' : 'network');
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new DictionaryError('network');
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new DictionaryError('invalid');
    }
    return parseDictionaryResponse(json);
  },
};

export const DICTIONARY_TIMEOUT_MS = 5000;

/** Lookup with a hard timeout and an offline short-circuit. */
export async function lookupWord(
  term: string,
  provider: DictionaryProvider = freeDictionaryProvider,
  timeoutMs = DICTIONARY_TIMEOUT_MS,
): Promise<DictionaryResult | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new DictionaryError('offline');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await provider.lookup(term, ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}
