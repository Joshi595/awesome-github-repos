import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
});

test('rising lists what is gaining stars', async ({ page }) => {
  await page.goto('/rising/');
  await expect(page.getByRole('heading', { name: 'Most stars gained, 7 days' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fastest to get here' })).toBeVisible();
  await expect(page.locator('#week .row').first()).toBeVisible();
  await expect(page.locator('#week .meta-highlight').first()).toContainText('/ 7d');
});

test('weekly reports: the list, a report, and what left the list', async ({ page }) => {
  await page.goto('/weekly/');
  const card = page.locator('.card').first();
  await expect(card).toContainText('In progress');
  await card.click();

  await expect(page).toHaveURL(/\/weekly\/\d{4}-w\d{2}\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Week');
  await expect(page.getByText('still in progress')).toBeVisible();
  await expect(
    page.locator('section[aria-labelledby="gainers-title"] .movers li').first(),
  ).toBeVisible();
  await expect(page.locator('section[aria-labelledby="left-title"]')).toContainText(
    'example/departed-sample',
  );
});

test('a repository page has the chart, the tool links and maintenance facts', async ({ page }) => {
  await page.goto('/repo/kubernetes/kubernetes/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('kubernetes');

  const chart = page.locator('.chart');
  await expect(chart.locator('.chart-line')).toHaveCount(1);
  // A single series is named by its heading, so it has no legend box.
  await expect(chart.locator('.chart-legend')).toHaveCount(0);
  await chart.locator('summary').click();
  await expect(chart.locator('tbody tr')).toHaveCount(2);

  await expect(page.getByRole('link', { name: /Ingest for AI/ })).toHaveAttribute(
    'href',
    'https://gitingest.com/kubernetes/kubernetes',
  );
  await expect(page.getByRole('heading', { name: 'Maintenance' })).toBeVisible();
  await expect(page.getByText('Latest release')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Systems Design Classics' })).toBeVisible();
});

test('the chart tooltip follows the pointer', async ({ page }) => {
  await page.goto('/repo/kubernetes/kubernetes/');
  const svg = page.locator('.chart svg');
  await svg.scrollIntoViewIfNeeded();
  const box = (await svg.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
  await expect(page.locator('.chart-tooltip')).toBeVisible();
  await expect(page.locator('.chart-tooltip strong')).toHaveText(/[\d,]+/);
});

for (const [path, selector] of [
  ['/collections/', '.card'],
  ['/collections/command-line-essentials/', '.row-note'],
  ['/topics/', '.tag'],
  ['/languages/', '.bar-list li'],
  ['/about/', '.prose h2'],
  ['/compare/', '.compare-add'],
  ['/lists/', '.lists-nav'],
] as const) {
  test(`${path} renders`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator(selector).first()).toBeVisible();
  });
}

test('an unknown page shows the not-found message', async ({ page }) => {
  const response = await page.goto('/repo/nobody/nothing/');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

test('pages carry social preview tags and link the feed and sitemap', async ({ page, request }) => {
  await page.goto('/repo/kubernetes/kubernetes/');
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /kubernetes/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/og\.png$/);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    'content',
    'summary_large_image',
  );

  expect((await request.get('/og.png')).headers()['content-type']).toContain('image/png');
  expect(await (await request.get('/weekly/feed.xml')).text()).toContain('<rss version="2.0">');
  expect(await (await request.get('/robots.txt')).text()).toContain('Sitemap:');
  expect((await request.get('/sitemap-index.xml')).ok()).toBe(true);
});

test('the theme toggle switches and is remembered', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page.getByRole('button', { name: /theme/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.goto('/languages/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
