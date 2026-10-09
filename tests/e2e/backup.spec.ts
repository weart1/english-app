import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { answerTyping, currentPrompt, importText, onSummary, startTypingSession } from './helpers';

async function exportBackup(page: Page, path: string) {
  await page.goto('/settings');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Резервная копия (JSON)' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^wordflow-backup-\d{4}-\d{2}-\d{2}\.json$/);
  await file.saveAs(path);
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

/**
 * File paths for setInputFiles must be ASCII: Chromium silently drops uploads from
 * paths like Playwright's default output dir (which contains "→" from the test title).
 */
function tmpFile(name: string, info: { workerIndex: number; repeatEachIndex: number; project: { name: string } }) {
  return join(tmpdir(), `wordflow-e2e-${info.project.name}-${info.workerIndex}-${info.repeatEachIndex}-${name}`);
}

function comparable(b: Record<string, unknown>) {
  const settings = { ...(b.settings as Record<string, unknown>) };
  delete settings.lastBackupAt;
  return { ...b, exportedAt: null, settings };
}

test('export backup → delete all data → restore → identical library', async ({ page }, info) => {
  const words: Record<string, string> = { apple: 'яблоко', cat: 'кот', river: 'река', 'give up': 'сдаваться' };
  await importText(page, Object.entries(words).map(([t, r]) => `${t} - ${r}`).join('\n'), 4);
  // Build some history: one wrong answer, the rest correct.
  await startTypingSession(page);
  let first = true;
  for (let i = 0; i < 10 && !onSummary(page); i++) {
    const prompt = await currentPrompt(page);
    await answerTyping(page, first ? 'не знаю' : (words[prompt] ?? ''));
    first = false;
  }
  await expect(page).toHaveURL(/\/session\/summary$/);

  const before = await exportBackup(page, tmpFile('before.json', info));
  expect((before.words as unknown[]).length).toBe(4);
  expect((before.logs as unknown[]).length).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Удалить все данные' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Продолжить' }).click();
  await page.getByRole('alertdialog').getByRole('textbox').fill('УДАЛИТЬ');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/library');
  await expect(page.getByText('Добавьте первое слово')).toBeVisible();

  await page.goto('/settings');
  await page.getByLabel('Выбрать файл копии').setInputFiles(tmpFile('before.json', info));
  await page.getByRole('button', { name: /Заменить всё/ }).click();
  await expect(page.getByRole('alertdialog')).toContainText('После замены: 4 слова');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Подтвердить' }).click();
  await expect(page.getByText('Данные восстановлены')).toBeVisible();

  const after = await exportBackup(page, tmpFile('after.json', info));
  expect(comparable(after)).toEqual(comparable(before));
});

test('an invalid backup file is rejected without changes', async ({ page }, info) => {
  await importText(page, 'apple - яблоко', 1);
  await page.goto('/settings');
  const bad = tmpFile('bad.json', info);
  writeFileSync(bad, '{"app":"WordFlow","words":[{"id":1}]}');
  await page.getByLabel('Выбрать файл копии').setInputFiles(bad);
  await expect(page.getByText('Файл повреждён или это не резервная копия WordFlow. Данные не изменены.')).toBeVisible();
  await page.goto('/library');
  await expect(page.getByText('1 слово')).toBeVisible();
});
