import { expect, test } from '@playwright/test';
import { act, newPlayer, playUntilVictory, quiet } from './helpers';

test('two friends play a full online game, survive a reconnect, and rematch', async ({ browser }, info) => {
  const a = await newPlayer(browser, info);
  await a.page.goto('/');
  await a.page.getByRole('button', { name: 'Play a Friend' }).click();
  await expect(a.page.getByTestId('invite')).toBeVisible();
  await expect(a.page.getByTestId('dice')).toBeDisabled();
  const link = await a.page.getByLabel('Invite link').inputValue();

  // The friend opens the link with the code in lowercase.
  const b = await newPlayer(browser, info);
  await b.page.goto(link.replace(/\/g\/(\w+)$/, (_m, id: string) => `/g/${id.toLowerCase()}`));
  await expect(a.page.getByTestId('invite')).toBeHidden();
  await expect(b.page.getByTestId('dice')).toBeVisible();
  await expect(b.page.getByText('You are watching this game.')).toHaveCount(0);

  for (let i = 0; i < 30; i++) {
    await act(a.page);
    await act(b.page);
  }

  // Network blip, then a full reload: the friend gets their seat back.
  await b.ctx.setOffline(true);
  await b.page.waitForTimeout(500);
  await b.ctx.setOffline(false);
  await b.page.reload();
  await expect(b.page.getByTestId('dice')).toBeVisible();
  await expect(b.page.getByText('You are watching this game.')).toHaveCount(0);

  await playUntilVictory([a.page, b.page]);
  await expect(b.page.getByTestId('victory')).toBeVisible();

  const c = await newPlayer(browser, info);
  await c.page.goto(link);
  await expect(c.page.getByText('You are watching this game.')).toBeVisible();

  await a.page.getByRole('button', { name: 'Rematch' }).click();
  await expect(a.page.getByRole('button', { name: 'Waiting for rival…' })).toBeDisabled();
  await b.page.getByRole('button', { name: 'Accept rematch' }).click();
  await expect(a.page.getByTestId('victory')).toBeHidden();
  await expect(b.page.getByTestId('victory')).toBeHidden();
});

test('an unknown game shows a friendly message', async ({ page }) => {
  await quiet(page);
  await page.goto('/g/ZZZZZZ');
  await expect(page.getByRole('heading', { name: 'This game no longer exists' })).toBeVisible();
});
