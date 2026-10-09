import { expect, test } from '@playwright/test';
import { answerTyping, counter, currentPrompt, importText, startTypingSession } from './helpers';

const WORDS: Record<string, string> = { apple: 'яблоко', cat: 'кот', river: 'река', sun: 'солнце', tree: 'дерево' };

test('relaunch mid-session → "Продолжить тренировку?" restores the position', async ({ page }) => {
  await importText(page, Object.entries(WORDS).map(([t, r]) => `${t} - ${r}`).join('\n'), 5);
  await startTypingSession(page);
  await answerTyping(page, WORDS[await currentPrompt(page)] ?? '');
  await answerTyping(page, WORDS[await currentPrompt(page)] ?? '');
  await expect.poll(() => counter(page)).toBe('2 / 5');
  const next = await currentPrompt(page);

  // iOS relaunches a killed PWA at start_url.
  await page.goto('/');
  const dialog = page.getByRole('alertdialog', { name: 'Продолжить тренировку?' });
  await expect(dialog).toContainText('осталось 3 карточки');
  await dialog.getByRole('button', { name: 'Продолжить' }).click();
  await expect(page).toHaveURL(/\/session$/);
  await expect.poll(() => counter(page)).toBe('2 / 5');
  expect(await currentPrompt(page)).toBe(next);

  // A hard reload on the session screen also keeps the position.
  await page.reload();
  await expect.poll(() => counter(page)).toBe('2 / 5');
  expect(await currentPrompt(page)).toBe(next);
});
