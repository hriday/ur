import { expect, test } from '@playwright/test';
import { act, dropSockets, newPlayer, playUntilVictory, quiet, seatedNote } from './helpers';

test('two friends play a full online game, survive a reconnect, and rematch', async ({ browser }, info) => {
  const a = await newPlayer(browser, info);
  await a.page.goto('/');
  await a.page.getByRole('button', { name: 'Play a Friend' }).click();
  await expect(a.page.getByTestId('invite')).toBeVisible();
  await expect(a.page.getByTestId('dice')).toBeDisabled();
  const link = await a.page.getByLabel('Invite link').inputValue();

  // The friend opens the link with the code in lowercase.
  const b = await newPlayer(browser, info);
  const url = new URL(link);
  const code = url.pathname.split('/').pop() ?? '';
  expect(code).toMatch(/^[A-Za-z0-9]+$/);
  expect(code).toMatch(/[A-Z]/); // the code has letters, so lowercasing changes it
  url.pathname = url.pathname.replace(code, code.toLowerCase());
  expect(url.toString()).not.toBe(link);
  await b.page.goto(url.toString());
  expect(b.page.url()).toContain(`/g/${code.toLowerCase()}`);
  await expect(a.page.getByTestId('invite')).toBeHidden();
  await expect(b.page.getByTestId('dice')).toBeVisible();
  await expect(seatedNote(b.page)).toBeVisible();
  await expect(b.page.getByText('You are watching this game.')).toHaveCount(0);

  let acted = 0;
  for (let i = 0; i < 30; i++) {
    if (await act(a.page)) acted++;
    if (await act(b.page)) acted++;
  }
  expect(acted).toBeGreaterThan(5);

  // A genuine connection drop (no reload): the banner shows, then the socket recovers.
  await dropSockets(b.page);
  await expect(b.page.getByText('Connection lost — reconnecting…')).toBeVisible();
  await expect(b.page.getByText('Connection lost — reconnecting…')).toBeHidden({ timeout: 15_000 });
  await expect(seatedNote(b.page)).toBeVisible();
  let after = 0;
  for (let i = 0; i < 30; i++) {
    if (await act(a.page)) after++;
    if (await act(b.page)) after++;
  }
  expect(after).toBeGreaterThan(5);

  // A full reload: the friend gets their seat back.
  await b.ctx.setOffline(true);
  await b.page.waitForTimeout(500);
  await b.ctx.setOffline(false);
  await b.page.reload();
  await expect(b.page.getByTestId('dice')).toBeVisible();
  await expect(seatedNote(b.page)).toBeVisible();
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
