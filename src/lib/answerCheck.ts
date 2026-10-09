/**
 * Typed-answer checking (pure).
 *
 * Normalization: trim, lowercase, collapse spaces, strip surrounding
 * punctuation, unify apostrophes (’ → '), ё = е. Any accepted answer matches.
 * English answers tolerate a leading "to " (verbs) and "a/an/the " (nouns).
 * Typo tolerance (Levenshtein): ≤ 1 for 4–7 characters, ≤ 2 for 8+ → accepted
 * but graded Hard ("Почти!").
 */

export type AnswerLang = 'en' | 'ru';

export type Verdict = 'correct' | 'typo' | 'wrong';

export interface CheckResult {
  verdict: Verdict;
  /** The accepted answer that matched best (display form). */
  expected: string;
  distance: number;
}

export function normalizeAnswer(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[’‘ʼ`´]/g, "'")
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[^\p{L}\p{N}([]+|[^\p{L}\p{N})\]]+$/gu, '')
    .trim();
}

const EN_PREFIXES = /^(to|a|an|the)\s+/;

/** Equivalent normalized forms of one answer. */
export function answerVariants(s: string, lang: AnswerLang): string[] {
  const out = new Set<string>();
  const add = (v: string) => {
    const n = normalizeAnswer(v);
    if (!n) return;
    out.add(n);
    if (lang === 'en') {
      const stripped = n.replace(EN_PREFIXES, '');
      if (stripped && stripped !== n) out.add(stripped);
    }
  };
  add(s);
  // "бежать (быстро)" → also accept "бежать".
  const noParens = s.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ');
  if (noParens !== s) add(noParens);
  return [...out];
}

/** Classic Levenshtein distance (insert / delete / substitute = 1). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array<number>(b.length + 1);
  let cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length] ?? 0;
}

/** Allowed typo distance for an expected answer of this length. */
export function typoTolerance(length: number): number {
  if (length >= 8) return 2;
  if (length >= 4) return 1;
  return 0;
}

function checkSingle(input: string, accepted: readonly string[], lang: AnswerLang): CheckResult {
  const inputs = answerVariants(input, lang);
  let best: CheckResult = { verdict: 'wrong', expected: accepted[0] ?? '', distance: Infinity };
  if (inputs.length === 0) return best;
  for (const a of accepted) {
    const targets = answerVariants(a, lang);
    for (const t of targets) {
      for (const i of inputs) {
        if (i === t) return { verdict: 'correct', expected: a, distance: 0 };
        const d = levenshtein(i, t);
        if (d < best.distance) {
          best = { verdict: d <= typoTolerance(t.length) ? 'typo' : 'wrong', expected: a, distance: d };
        }
      }
    }
  }
  return best;
}

/**
 * Checks a typed answer against all accepted answers. Several comma-separated
 * answers are accepted when every part is correct ("кот, кошка").
 */
export function checkAnswer(input: string, accepted: readonly string[], lang: AnswerLang): CheckResult {
  const whole = checkSingle(input, accepted, lang);
  if (whole.verdict === 'correct') return whole;
  const parts = input.split(/[,;]/).filter((p) => normalizeAnswer(p));
  if (parts.length > 1) {
    const results = parts.map((p) => checkSingle(p, accepted, lang));
    if (results.every((r) => r.verdict !== 'wrong')) {
      const typo = results.find((r) => r.verdict === 'typo');
      return typo ?? results[0] ?? whole;
    }
  }
  return whole;
}

/* ---------- Diff for highlighting mistakes ---------- */

export interface DiffSegment {
  text: string;
  ok: boolean;
}

function foldChar(c: string): string {
  return c.toLowerCase().replace('ё', 'е').replace(/[’‘ʼ`´]/, "'");
}

/**
 * Aligns the user's input with the expected answer. Returns the expected answer
 * split into segments where `ok: false` marks letters the user missed or got wrong,
 * and the input split where `ok: false` marks extra or wrong letters.
 */
export function diffAnswer(input: string, expected: string): { expected: DiffSegment[]; input: DiffSegment[] } {
  const a = Array.from(input.trim());
  const b = Array.from(expected);
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 0; i <= n; i++) (dp[i] as number[])[0] = i;
  for (let j = 0; j <= m; j++) (dp[0] as number[])[j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = foldChar(a[i - 1] as string) === foldChar(b[j - 1] as string) ? 0 : 1;
      (dp[i] as number[])[j] = Math.min(
        (dp[i - 1] as number[])[j]! + 1,
        (dp[i] as number[])[j - 1]! + 1,
        (dp[i - 1] as number[])[j - 1]! + cost,
      );
    }
  }
  const expOk = new Array<boolean>(m).fill(false);
  const inOk = new Array<boolean>(n).fill(false);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const cost = foldChar(a[i - 1] as string) === foldChar(b[j - 1] as string) ? 0 : 1;
    const here = (dp[i] as number[])[j]!;
    if (here === (dp[i - 1] as number[])[j - 1]! + cost) {
      if (cost === 0) {
        expOk[j - 1] = true;
        inOk[i - 1] = true;
      }
      i--;
      j--;
    } else if (here === (dp[i - 1] as number[])[j]! + 1) {
      i--;
    } else {
      j--;
    }
  }
  const group = (chars: string[], ok: boolean[]): DiffSegment[] => {
    const segs: DiffSegment[] = [];
    chars.forEach((c, k) => {
      const isOk = ok[k] ?? false;
      const last = segs[segs.length - 1];
      if (last && last.ok === isOk) last.text += c;
      else segs.push({ text: c, ok: isOk });
    });
    return segs;
  };
  return { expected: group(b, expOk), input: group(a, inOk) };
}
