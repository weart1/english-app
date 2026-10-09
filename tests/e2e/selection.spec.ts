import { expect, test } from '@playwright/test';

const lines = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `${prefix}${i} - перевод ${prefix}${i}`).join('\n');

test('Случайные N picks exactly N words from the filtered list', async ({ page }) => {
  // 12 "alpha" words + 8 "beta" words.
  await page.goto('/import');
  await page.getByLabel(/Одно слово на строку/).fill(`${lines(12, 'alpha')}\n${lines(8, 'beta')}`);
  await page.getByRole('button', { name: 'Импортировать (20)' }).click();
  await expect(page).toHaveURL(/\/library$/);

  await page.getByRole('button', { name: 'Выбрать', exact: true }).click();
  await page.getByRole('searchbox').fill('beta');
  await expect(page.getByText('8 из 20')).toBeVisible();

  await page.getByRole('button', { name: 'Случайные N…' }).click();
  const sheet = page.getByRole('dialog', { name: 'Случайные слова' });
  await sheet.getByRole('button', { name: 'Меньше' }).click(); // 5 → 4
  await sheet.getByRole('button', { name: 'Больше' }).click(); // 4 → 5
  await sheet.getByRole('button', { name: 'Выбрать 5 слов' }).click();
  await expect(page.getByText('Выбрано: 5')).toBeVisible();

  // Selection survives clearing the search, and contains only filtered words.
  await page.getByRole('button', { name: 'Очистить поиск' }).click();
  await expect(page.getByText('20 слов')).toBeVisible();
  const checked = page.getByRole('checkbox', { checked: true });
  await expect(checked).toHaveCount(5);
  const names = await checked.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
  for (const n of names) expect(n).toMatch(/«beta\d+»/);

  // "Выбрать все" respects the active filter.
  await page.getByRole('button', { name: 'Снять все' }).click();
  await page.getByRole('searchbox').fill('alpha1');
  await expect(page.getByText('3 из 20')).toBeVisible();
  await page.getByRole('button', { name: 'Выбрать все' }).click();
  await expect(page.getByText('Выбрано: 3')).toBeVisible(); // alpha1, alpha10, alpha11
});
