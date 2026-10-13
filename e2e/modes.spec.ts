import { expect, test } from '@playwright/test';
import { act, playUntilVictory, quiet } from './helpers';

test.beforeEach(async ({ page }) => quiet(page));

test('pass & play runs to victory and starts again', async ({ page }) => {
  await page.goto('/play/local');
  await playUntilVictory([page]);
  await expect(page.getByRole('heading', { name: /wins$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.getByTestId('victory')).toBeHidden();
});

test('the computer takes its own turns', async ({ page }) => {
  await page.goto('/play/ai/easy');
  await expect(page.getByText('Computer · Easy')).toBeVisible();
  let mine = 0;
  for (let i = 0; i < 600 && mine < 8; i++) {
    if (await act(page)) mine++;
    else await page.waitForTimeout(100);
  }
  expect(mine).toBe(8);
  await expect.poll(() => page.getByRole('img', { name: /Carnelian piece on square/ }).count(), { timeout: 30_000 }).toBeGreaterThan(0);
});

test('touch: tap previews the destination, a second tap moves', async ({ page }, info) => {
  test.skip(!info.project.use.hasTouch, 'touch devices only');
  await page.goto('/play/local');
  const movable = page.locator('[data-movable]');
  for (let i = 0; i < 200 && (await movable.count()) === 0; i++) {
    const dice = page.getByTestId('dice');
    if (await dice.isEnabled()) await dice.tap();
    else await page.waitForTimeout(50);
  }
  const label = await movable.first().getAttribute('aria-label');
  await movable.first().tap();
  await expect(page.locator('.ghost')).toBeVisible();
  await movable.first().tap();
  await expect(page.locator('.ghost')).toHaveCount(0);
  // The piece really moved: no button with its old label remains.
  await expect(page.getByRole('button', { name: label!, exact: true })).toHaveCount(0);
});

test('keyboard: Space throws the dice', async ({ page }, info) => {
  test.skip(!!info.project.use.hasTouch, 'keyboard on desktop only');
  await page.goto('/play/local');
  await expect(page.getByTestId('dice')).toBeEnabled();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('dice').locator('.total')).toHaveText(/^[0-4]$/);
});

test('rules are explained on their own page and in-game', async ({ page }) => {
  await page.goto('/how-to-play');
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(9);
  await page.goto('/play/local');
  await page.getByRole('button', { name: 'How to play' }).click();
  const dialog = page.getByRole('dialog', { name: 'How to play' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('home fits the screen without sideways scrolling', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play a Friend' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
