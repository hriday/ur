import { expect, test } from '@playwright/test';
import { act, cspViolations, playUntilVictory, quiet } from './helpers';

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

test('/play/ai opens the difficulty picker', async ({ page }) => {
  await page.goto('/play/ai');
  await expect(page.getByRole('heading', { name: /The Royal Game/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play the Computer' })).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('link', { name: /Medium/ }).click();
  await expect(page).toHaveURL(/\/play\/ai\/medium$/);
  await expect(page.getByText('Computer · Medium')).toBeVisible();
});

test('pass & play and computer games survive a reload', async ({ page }) => {
  const onBoard = page.locator('[aria-label*="piece on square"]');
  const board = async () =>
    (await onBoard.evaluateAll((els) => els.map((e) => (e.getAttribute('aria-label') ?? '').replace(', can move', '')))).sort();
  for (const path of ['/play/local', '/play/ai/easy']) {
    await page.goto(path);
    for (let i = 0; i < 400 && (await onBoard.count()) < 2; i++) {
      if (!(await act(page))) await page.waitForTimeout(50);
    }
    // Wait until it is our turn to roll, so nothing moves on its own across the reload.
    await expect(page.getByTestId('dice')).toBeEnabled({ timeout: 30_000 });
    const before = await board();
    expect(before.length).toBeGreaterThanOrEqual(2);
    await page.reload();
    await expect(page.getByTestId('dice')).toBeEnabled({ timeout: 30_000 });
    expect(await board()).toEqual(before);
  }
});

test('the app runs under its Content Security Policy', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.headers()['content-security-policy']).toContain("script-src 'self'");
  await expect(page.getByRole('heading', { name: /The Royal Game/ })).toBeVisible();
  await page.getByRole('button', { name: 'Play the Computer' }).click();
  await page.getByRole('link', { name: /Hard/ }).click();
  // Let the computer think in its worker at least once.
  let mine = 0;
  for (let i = 0; i < 400 && mine < 3; i++) {
    if (await act(page)) mine++;
    else await page.waitForTimeout(100);
  }
  await expect.poll(() => page.getByRole('img', { name: /Carnelian piece on square/ }).count(), { timeout: 30_000 }).toBeGreaterThan(0);
  expect(await cspViolations(page)).toEqual([]);
});
