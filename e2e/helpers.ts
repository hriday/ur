import type { Browser, BrowserContextOptions, Page, TestInfo } from '@playwright/test';

/** Silence sound and beginner tips so they don't interfere with automation. */
export async function quiet(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ur.coach.off', '1');
    localStorage.setItem('ur.muted', '1');
  });
}

function contextOptions(info: TestInfo): BrowserContextOptions {
  const u = info.project.use;
  return {
    baseURL: u.baseURL,
    viewport: u.viewport,
    userAgent: u.userAgent,
    deviceScaleFactor: u.deviceScaleFactor,
    isMobile: u.isMobile,
    hasTouch: u.hasTouch,
    reducedMotion: 'reduce',
  };
}

/** A separate browser profile — a separate player. */
export async function newPlayer(browser: Browser, info: TestInfo) {
  const ctx = await browser.newContext(contextOptions(info));
  const page = await ctx.newPage();
  await quiet(page);
  return { ctx, page };
}

/** Takes one action (roll or move) if this page may act right now. */
export async function act(page: Page): Promise<boolean> {
  try {
    const dice = page.getByTestId('dice');
    if (await dice.isEnabled({ timeout: 1000 })) {
      await dice.click({ timeout: 1000 });
      return true;
    }
    const piece = page.locator('[data-movable]').first();
    if (await piece.count()) {
      await piece.click({ timeout: 1000, force: true });
      return true;
    }
  } catch {
    /* the state changed under us; try again next round */
  }
  return false;
}

export async function playUntilVictory(pages: Page[], maxRounds = 4000) {
  for (let i = 0; i < maxRounds; i++) {
    if (await pages[0].getByTestId('victory').isVisible()) return;
    let acted = false;
    for (const p of pages) acted = (await act(p)) || acted;
    if (!acted) await pages[0].waitForTimeout(40);
  }
  throw new Error('The game did not finish');
}
