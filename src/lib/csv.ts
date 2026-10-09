/**
 * Minimal RFC 4180 CSV: quoted fields, commas/newlines inside quotes, "" escapes,
 * BOM, \n and \r\n. Delimiter can be "," or ";" (Excel in Russian locale).
 */

export function detectDelimiter(text: string): ',' | ';' | '\t' {
  const firstLine = (text.replace(/^﻿/, '').split(/\r?\n/).find((l) => l.trim()) ?? '');
  let inQuotes = false;
  const counts = { ',': 0, ';': 0, '\t': 0 };
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === ',' || ch === ';' || ch === '\t')) counts[ch]++;
  }
  if (counts['\t'] > counts[','] && counts['\t'] > counts[';']) return '\t';
  return counts[';'] > counts[','] ? ';' : ',';
}

/** Parses CSV text into rows of fields. Each row carries its starting line number (1-based). */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): { line: number; fields: string[] }[] {
  const src = text.replace(/^﻿/, '');
  const rows: { line: number; fields: string[] }[] = [];
  let field = '';
  let fields: string[] = [];
  let inQuotes = false;
  let line = 1;
  let rowLine = 1;
  let fieldWasQuoted = false;

  const endField = () => {
    fields.push(fieldWasQuoted ? field : field.trim());
    field = '';
    fieldWasQuoted = false;
  };
  const endRow = () => {
    endField();
    if (fields.some((f) => f.trim() !== '')) rows.push({ line: rowLine, fields });
    fields = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field.trim() === '') {
      inQuotes = true;
      fieldWasQuoted = true;
      field = '';
    } else if (ch === delimiter) {
      endField();
    } else if (ch === '\r') {
      if (src[i + 1] === '\n') i++;
      endRow();
      line++;
      rowLine = line;
    } else if (ch === '\n') {
      endRow();
      line++;
      rowLine = line;
    } else {
      field += ch;
    }
  }
  if (field !== '' || fields.length > 0 || fieldWasQuoted) endRow();
  return rows;
}

function quote(value: string, delimiter: string): string {
  return /["\r\n]/.test(value) || value.includes(delimiter) || /^\s|\s$/.test(value)
    ? `"${value.replace(/"/g, '""')}"`
    : value;
}

export function toCsv(rows: readonly (readonly string[])[], delimiter = ','): string {
  return rows.map((r) => r.map((v) => quote(v, delimiter)).join(delimiter)).join('\r\n');
}
