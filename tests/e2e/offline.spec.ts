import { expect, test } from '@playwright/test';

test('works offline after the first load: reload, add a word, finish a session', async ({ page, context }) => {
  await page.goto('/');
  // Wait until the service worker controls the page (precache done).
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // Deep link + lazy chunks from the cache.
  await page.goto('/library');
  await page.getByRole('button', { name: 'Добавить слово' }).first().click();
  for (const [t, tr] of [
    ['offline', 'офлайн'],
    ['cache', 'кэш'],
  ]) {
    await page.getByLabel('Слово или фраза (English)').fill(t as string);
    await page.getByLabel('Переводы').fill(tr as string);
    await page.getByRole('button', { name: 'Сохранить и добавить ещё' }).click();
    await expect(page.getByLabel('Слово или фраза (English)')).toHaveValue('');
  }
  await page.getByRole('dialog').getByRole('button', { name: 'Закрыть' }).click();
  await expect(page.getByText('2 слова')).toBeVisible();

  // Dictionary autofill reports offline instead of failing.
  await page.getByRole('button', { name: 'Добавить слово' }).first().click();
  await page.getByLabel('Слово или фраза (English)').fill('apple');
  await page.getByRole('button', { name: 'Заполнить автоматически' }).click();
  await expect(page.getByText('Нет интернета — автозаполнение недоступно')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Закрыть' }).click();

  await page.goto('/train');
  await page.getByRole('radio', { name: 'Все слова' }).click();
  await page.getByRole('radio', { name: /Карточки/ }).click();
  await page.getByRole('radio', { name: 'EN → RU' }).click();
  await page.getByRole('button', { name: 'Начать' }).click();
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Показать ответ' }).click();
    await page.getByRole('button', { name: /^Легко/ }).click();
  }
  await expect(page).toHaveURL(/\/session\/summary$/);
  await expect(page.getByRole('img', { name: 'Точность: 100%' })).toBeVisible();
  await context.setOffline(false);
});
