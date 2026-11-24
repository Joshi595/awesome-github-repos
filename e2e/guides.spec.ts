import { expect, test } from '@playwright/test';

test('a visitor can choose from a guide, share the comparison, and save a tool', async ({
  context,
  page,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByRole('link', { name: 'Modern Command-Line Essentials' }).click();

  const textSearch = page.getByRole('region', { name: 'Search inside files' });
  const ripgrep = textSearch.locator('li').filter({ hasText: 'BurntSushi/ripgrep' });
  await expect(ripgrep.getByText('Best fit')).toBeVisible();
  await expect(ripgrep.getByText('Trade-off')).toBeVisible();

  await textSearch.getByRole('link', { name: /Compare ranked choices/ }).click();
  await expect(page.getByRole('heading', { name: 'Search inside files' })).toBeVisible();
  const comparison = page.getByRole('region', { name: 'Comparison table' });
  await expect(comparison.getByRole('columnheader', { name: /BurntSushi\/ripgrep/ })).toBeVisible();
  await expect(
    comparison.getByRole('columnheader', { name: /ggreer\/the_silver_searcher/ }),
  ).toBeVisible();
  await expect(comparison.getByRole('row', { name: /^Trade-off/ })).toContainText(
    'hidden and ignored files',
  );
  await expect(comparison.getByRole('row', { name: /^Rank/ }).locator('.is-best')).toHaveCount(0);
  await expect(
    comparison.getByRole('row', { name: /^Stars [\d,]/ }).locator('.is-best'),
  ).toHaveCount(0);

  const save = comparison.getByRole('button', { name: 'Save BurntSushi/ripgrep' });
  await save.click();
  await expect(
    comparison.getByRole('button', { name: 'Remove BurntSushi/ripgrep', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Copy comparison link' }).click();
  await expect(page.getByText('Link copied.')).toBeVisible();

  const sharedUrl = await page.evaluate(() => navigator.clipboard.readText());
  const shared = new URL(sharedUrl).searchParams;
  expect(shared.get('guide')).toBe('command-line-essentials');
  expect(shared.get('decision')).toBe('text-search');
  expect(shared.get('r')).toBe('BurntSushi/ripgrep,ggreer/the_silver_searcher');

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Lists' }).click();
  await expect(page.getByRole('link', { name: 'BurntSushi/ripgrep' })).toBeVisible();
  const visitor = await page.context().browser()!.newPage();
  try {
    await visitor.goto(sharedUrl);
    await expect(visitor.getByRole('heading', { name: 'Search inside files' })).toBeVisible();
    await expect(visitor.getByRole('button', { name: 'Save BurntSushi/ripgrep' })).toBeVisible();
  } finally {
    await visitor.close();
  }
});

test('guides show dated curated picks without loading the explorer index', async ({
  page,
  isMobile,
}) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 900 });
  const explorerRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/data/index.json'))
      explorerRequests.push(request.url());
  });
  await page.goto('/collections/command-line-essentials/');
  await page.waitForLoadState('networkidle');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);

  for (const [section, name, stars] of [
    ['Search inside files', 'Genivia/ugrep', '3,338'],
    ['Send HTTP requests', 'ducaale/xh', '8,219'],
  ]) {
    const pick = page
      .getByRole('region', { name: section })
      .locator('li')
      .filter({ hasText: name! });
    await expect(pick.getByText('Curated pick')).toBeVisible();
    await expect(pick).toContainText(`${stars} stars as of Nov 24, 2026`);
    await expect(pick.getByRole('link', { name: `${name} on GitHub` })).toHaveAttribute(
      'href',
      `https://github.com/${name}`,
    );
    await expect(pick.getByRole('button', { name: /Save/ })).toHaveCount(0);
  }
  expect(explorerRequests).toEqual([]);
});

test('the More menu supports keyboard navigation and focus return in dark mode', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/collections/');
  const more = page.locator('#nav-more summary');
  await more.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Rising', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(more).toBeFocused();
  await expect(page.getByRole('link', { name: 'Rising', exact: true })).toBeHidden();
});

test('the freshness notice appears when the snapshot reaches 48 hours', async ({ page }) => {
  await page.goto('/collections/');
  const notice = page.locator('#snapshot-freshness');
  const timestamp = Date.parse((await notice.locator('time').getAttribute('datetime'))!);
  await page.clock.setFixedTime(new Date(timestamp + 47 * 60 * 60 * 1000));
  await page.reload();
  await expect(notice).toBeHidden();
  await page.clock.setFixedTime(new Date(timestamp + 48 * 60 * 60 * 1000));
  await page.reload();
  await expect(notice).toBeVisible();
});

test('a plain comparison link still loads and labels missing details', async ({ page }) => {
  await page.route('**/data/detail/*.json', (route) => route.fulfill({ status: 503 }));
  await page.goto('/compare/?r=kubernetes/kubernetes,vercel/next.js');
  const comparison = page.getByRole('region', { name: 'Comparison table' });
  await expect(
    comparison.getByRole('columnheader', { name: /kubernetes\/kubernetes/ }),
  ).toBeVisible();
  await expect(comparison.getByRole('columnheader', { name: /vercel\/next.js/ })).toBeVisible();
  await expect(comparison.getByRole('row', { name: /^Latest release/ })).toContainText(
    'Unavailable',
  );
  await expect(comparison.getByRole('row', { name: /^Trade-off/ })).toHaveCount(0);
});
