/**
 * Text normalization shared by duplicate detection, search and answer checking.
 */

/** Lowercase, trim, collapse whitespace. Used for duplicate detection of terms. */
export function normalizeTerm(s: string): string {
  return unifyApostrophes(s).trim().toLowerCase().replace(/\s+/g, ' ');
}

export function unifyApostrophes(s: string): string {
  return s.replace(/[’‘ʼ`´]/g, "'");
}

/**
 * Search key: case-insensitive, diacritic-insensitive, ё = е.
 * Decomposes accents (é → e) but keeps Cyrillic й intact by re-composing it.
 */
export function searchKey(s: string): string {
  return unifyApostrophes(s)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/й/g, '\u0000')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\u0000/g, 'й')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Clean a user-entered single-line value. */
export function cleanLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Clean, dedupe (case-insensitively) and drop empties. */
export function cleanList(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const c = cleanLine(v);
    if (!c) continue;
    const key = searchKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** Split a translations string on commas / semicolons (not inside parentheses). */
export function splitTranslations(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++;
    if ((ch === ')' || ch === ']') && depth > 0) depth--;
    if ((ch === ',' || ch === ';') && depth === 0) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return cleanList(out);
}
