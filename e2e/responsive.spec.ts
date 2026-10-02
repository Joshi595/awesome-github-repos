import { expect, test } from '@playwright/test';

// Runs in both projects: at desktop width and on a phone-sized viewport.

const PAGES = [
  '/',
  '/rising/',
  '/weekly/',
  '/collections/',
  '/languages/',
  '/repo/vercel/next.js/',
  '/compare/?r=kubernetes/kubernetes,vercel/next.js',
  '/lists/',
  '/stars/',
  '/about/',
];

for (const path of PAGES) {
  test(`${path} never scrolls sideways`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('on a phone the filters open as a panel and close from the backdrop', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'The filter panel is always visible on wide screens.');
  await page.goto('/');
  const panel = page.locator('.explorer-filters');
  await expect(panel).toBeHidden();

  await page.getByRole('button', { name: /^Filters/ }).click();
  await expect(panel).toBeVisible();
  await page.locator('.filters-backdrop').click({ position: { x: 380, y: 300 } });
  await expect(panel).toBeHidden();
});
