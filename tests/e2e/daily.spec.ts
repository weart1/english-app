import { expect, test } from '@playwright/test';

test('«Слова дня» → add one to the library; catalog search adds a phrase', async ({ page }) => {
  await page.goto('/');
  const daily = page.getByRole('region', { name: 'Слова дня' });
  await expect(daily.getByText('3 новых слова для вас')).toBeVisible();

  // The pick is stable for the day: a reload shows the same items.
  const firstTerms = await daily.locator('li span[lang="en"]').allTextContents();
  expect(firstTerms).toHaveLength(3);
  await page.reload();
  await expect(daily.locator('li span[lang="en"]')).toHaveText(firstTerms);

  await daily.getByRole('button', { name: 'Учить', exact: true }).first().click();
  await expect(daily.getByText('В библиотеке')).toBeVisible();
  await daily.getByRole('button', { name: 'Знаю', exact: true }).first().click();
  await expect(daily.getByText('Уже знаю')).toBeVisible();

  await daily.getByRole('button', { name: 'Весь каталог' }).click();
  await expect(page).toHaveURL(/\/catalog$/);
  await page.getByRole('searchbox').fill('break the ice');
  await page.getByRole('button', { name: 'Добавить «break the ice» в библиотеку' }).click();
  await expect(page.getByRole('img', { name: 'В библиотеке' })).toBeVisible();

  await page.goto('/library');
  await expect(page.getByText('break the ice')).toBeVisible();
  await expect(page.getByText(firstTerms[0]!, { exact: true })).toBeVisible();
});
