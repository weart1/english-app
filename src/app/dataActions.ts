import { createBackup, backupFileName } from '@/db/backup';
import { updateSettings } from '@/db/repo';
import { db } from '@/db/schema';
import { toCsv } from '@/lib/csv';
import { localDateKey } from '@/lib/dates';
import { shareOrDownload, type ShareOutcome } from '@/lib/share';

/** Exports the JSON backup via the share sheet; records lastBackupAt on success. */
export async function exportJsonBackup(now = new Date()): Promise<ShareOutcome> {
  const backup = await createBackup(now);
  const file = new File([JSON.stringify(backup)], backupFileName(now), { type: 'application/json' });
  const outcome = await shareOrDownload(file, 'WordFlow');
  if (outcome !== 'cancelled') await updateSettings({ lastBackupAt: now.toISOString() });
  return outcome;
}

/** Words as CSV (term, translations, transcription, example, tags) — re-importable. */
export async function exportCsv(now = new Date()): Promise<ShareOutcome> {
  const [words, tags] = await Promise.all([db.words.orderBy('createdAt').toArray(), db.tags.toArray()]);
  const tagName = new Map(tags.map((t) => [t.id, t.name]));
  const rows = [
    ['term', 'translations', 'transcription', 'example', 'tags'],
    ...words.map((w) => [
      w.term,
      w.translations.join(', '),
      w.transcription ?? '',
      w.examples.join(' | '),
      w.tagIds.map((id) => tagName.get(id)).filter(Boolean).join(', '),
    ]),
  ];
  // BOM so Excel opens UTF-8 Cyrillic correctly.
  const file = new File(['﻿' + toCsv(rows)], `wordflow-words-${localDateKey(now)}.csv`, { type: 'text/csv' });
  return shareOrDownload(file, 'WordFlow CSV');
}
