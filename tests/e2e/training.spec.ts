import { expect, test } from '@playwright/test';
import { addWordsViaEditor, answerTyping, currentPrompt, onSummary, WORDS } from './helpers';

test('add 6 words → select 5 → typing session → wrong answers come back → correct summary', async ({ page }) => {
  await addWordsViaEditor(page, WORDS);
  await expect(page.getByText('6 слов')).toBeVisible();

  // Select 5 of the 6 words by hand.
  await page.getByRole('button', { name: 'Выбрать', exact: true }).click();
  const chosen = ['apple', 'give up', 'well-known', "don't", 'serendipity'];
  for (const t of chosen) await page.getByRole('checkbox', { name: `Выбрать «${t}»` }).click();
  await expect(page.getByText('Выбрано: 5')).toBeVisible();
  await page.getByRole('button', { name: 'Тренировать' }).click();

  await expect(page.getByRole('radio', { name: 'Выбранные слова (5)' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: /Написание/ }).click();
  await page.getByRole('radio', { name: 'EN → RU' }).click();
  await expect(page.getByText('5 слов · Написание · EN → RU')).toBeVisible();
  await page.getByRole('button', { name: 'Начать' }).click();
  await expect(page.getByLabel('Ваш ответ')).toBeVisible();
  await expect(page.locator('header span.tabular-nums')).toHaveText('0 / 5');

  const wrongOnce = new Set(['apple', 'serendipity']);
  const seen: string[] = [];
  for (let i = 0; i < 12 && !onSummary(page); i++) {
    const prompt = await currentPrompt(page);
    expect(chosen).toContain(prompt);
    seen.push(prompt);
    const answer = wrongOnce.delete(prompt) ? 'неправильно' : (WORDS[prompt] ?? '');
    await answerTyping(page, answer);
  }

  // Each wrong word appeared twice; every other word once.
  expect(seen).toHaveLength(7);
  expect(seen.filter((p) => p === 'apple')).toHaveLength(2);
  expect(seen.filter((p) => p === 'serendipity')).toHaveLength(2);
  expect(seen).not.toContain('river');
  for (const w of ['apple', 'serendipity']) {
    // Never repeated immediately (exact 3–5 placement is covered by unit tests).
    expect(seen.lastIndexOf(w) - seen.indexOf(w)).toBeGreaterThan(1);
  }

  await expect(page).toHaveURL(/\/session\/summary$/);
  await expect(page.getByRole('heading', { name: 'Тренировка завершена' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Точность: 71%' })).toBeVisible(); // 5 of 7 answers correct
  const hard = page.locator('section', { hasText: 'Сложные слова' });
  await expect(hard.getByText('apple', { exact: true })).toBeVisible();
  await expect(hard.getByText('serendipity', { exact: true })).toBeVisible();
  await expect(hard.getByText('give up', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Повторить ошибки' })).toBeVisible();
});

test('rapid double taps do not record two answers', async ({ page }) => {
  await addWordsViaEditor(page, { cat: 'кот', dog: 'собака' });
  await page.goto('/train');
  await page.getByRole('radio', { name: 'Все слова' }).click();
  await page.getByRole('radio', { name: /Карточки/ }).click();
  await page.getByRole('button', { name: 'Начать' }).click();
  await page.getByRole('button', { name: 'Показать ответ' }).click();
  await page.getByRole('button', { name: /^Хорошо/ }).dblclick();
  await expect(page.locator('header span.tabular-nums')).toHaveText(/^1 \/ \d+$/);
});
