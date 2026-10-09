import { expect, type Page } from '@playwright/test';

export const WORDS: Record<string, string> = {
  apple: 'яблоко',
  'give up': 'сдаваться',
  'well-known': 'известный',
  "don't": 'не делать',
  serendipity: 'счастливая случайность',
  river: 'река',
};

/** Adds words through the real "Новое слово" sheet. */
export async function addWordsViaEditor(page: Page, words: Record<string, string>) {
  await page.goto('/library');
  await page.getByRole('button', { name: 'Добавить слово' }).first().click();
  for (const [term, tr] of Object.entries(words)) {
    await page.getByLabel('Слово или фраза (English)').fill(term);
    await page.getByLabel('Переводы').fill(tr);
    await page.getByRole('button', { name: 'Сохранить и добавить ещё' }).click();
    await expect(page.getByLabel('Слово или фраза (English)')).toHaveValue('');
  }
  await page.getByRole('dialog').getByRole('button', { name: 'Закрыть' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/** Bulk-adds words through the import screen (text or CSV-like text). */
export async function importText(page: Page, text: string, expected: number) {
  await page.goto('/import');
  await page.getByLabel(/Одно слово на строку/).fill(text);
  await page.getByRole('button', { name: `Импортировать (${expected})` }).click();
  await expect(page).toHaveURL(/\/library$/);
}

/** Closes the "Продолжить тренировку?" prompt if it shows up. */
export async function dismissResume(page: Page) {
  const dialog = page.getByRole('alertdialog', { name: 'Продолжить тренировку?' });
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole('button', { name: 'Завершить' }).click();
  }
}

/** Reads the current English prompt in a typing (EN → RU) card. */
export async function currentPrompt(page: Page): Promise<string> {
  return ((await page.locator('main p[lang="en"]').first().textContent()) ?? '').trim();
}

export async function counter(page: Page): Promise<string> {
  return ((await page.locator('header span.tabular-nums').textContent()) ?? '').trim();
}

export async function startTypingSession(page: Page, source: RegExp | string = 'Все слова') {
  await page.goto('/train');
  await dismissResume(page);
  await page.getByRole('radio', { name: source }).click();
  await page.getByRole('radio', { name: /Написание/ }).click();
  await page.getByRole('radio', { name: 'EN → RU' }).click();
  await page.getByRole('button', { name: 'Начать' }).click();
  await expect(page).toHaveURL(/\/session$/);
  await expect(page.getByLabel('Ваш ответ')).toBeVisible();
}

/** Answers the current typing card and waits until the next card (or the summary) is shown. */
export async function answerTyping(page: Page, answer: string) {
  const prompt = await currentPrompt(page);
  await page.getByLabel('Ваш ответ').fill(answer);
  await page.getByRole('button', { name: 'Проверить' }).click();
  await page.getByRole('button', { name: 'Далее' }).click();
  await expect(page.getByRole('button', { name: 'Проверить' }).or(page.getByRole('button', { name: 'Готово' }))).toBeVisible();
  return prompt;
}

export function onSummary(page: Page): boolean {
  return page.url().includes('/session/summary');
}
