import { expect, test, type Page } from '@playwright/test';

/** Rows are server-rendered; filters only work once the dataset has loaded. */
async function openExplorer(page: Page, query = '') {
  await page.goto(`/${query}`);
  await expect(page.locator('.toolbar-count')).not.toContainText('Loading');
  await expect(page.getByText('Loading the full list')).toHaveCount(0);
}

const rows = (page: Page) => page.locator('.explorer .row');
const names = (page: Page) => page.locator('.explorer .row-name');
const search = (page: Page) => page.getByRole('searchbox', { name: 'Search repositories' });
const facet = (page: Page, title: string) =>
  page.locator('.facet').filter({ has: page.locator('summary', { hasText: title }) });

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
});

test('shows the list before and after the dataset loads', async ({ page }) => {
  await openExplorer(page);
  await expect(rows(page)).toHaveCount(50);
  await expect(page.locator('.toolbar-count')).toContainText('repositories');
  await expect(names(page).first()).toHaveText('codecrafters-io/build-your-own-x');
});

test('search ranks an exact name first and is reflected in the URL and a chip', async ({
  page,
}) => {
  await openExplorer(page);
  await search(page).fill('kubernetes');
  await expect(names(page).first()).toHaveText('kubernetes/kubernetes');
  await expect(page).toHaveURL(/q=kubernetes/);

  const chips = page.locator('.chips .chip');
  await expect(chips).toHaveCount(1);
  await chips.getByRole('button').click();
  await expect(search(page)).toHaveValue('');
  await expect(page).not.toHaveURL(/q=/);
});

test('a mistyped search is corrected', async ({ page }) => {
  await openExplorer(page);
  await search(page).fill('kuberntes');
  await expect(page.locator('.correction')).toContainText('Showing results for kubernetes');
  await expect(names(page).first()).toHaveText('kubernetes/kubernetes');

  await page.locator('.correction').getByRole('button', { name: 'kubernetes' }).click();
  await expect(search(page)).toHaveValue('kubernetes');
  await expect(page.locator('.correction')).toHaveCount(0);
});

test('filters combine, survive re-rendering, and follow back and forward', async ({ page }) => {
  await openExplorer(page);
  const all = await page.locator('.toolbar-count strong').innerText();

  const domain = facet(page, 'Domain').getByRole('checkbox').first();
  await domain.check();
  await expect(page).toHaveURL(/domain=/);
  await expect(page.locator('.toolbar-count strong')).not.toHaveText(all);

  const activity = facet(page, 'Activity').getByRole('checkbox').first();
  await activity.check();
  await expect(activity).toBeChecked();
  await expect(domain).toBeChecked();
  await expect(page.locator('.chips .chip')).toHaveCount(2);

  await page.goBack();
  await expect(activity).not.toBeChecked();
  await expect(domain).toBeChecked();
  await page.goForward();
  await expect(activity).toBeChecked();

  await page.getByRole('button', { name: 'Clear all' }).click();
  await expect(page.locator('.toolbar-count strong')).toHaveText(all);
});

test('a deep link restores the view, and a collection still allows searching', async ({ page }) => {
  await openExplorer(page, '?collection=frontend-foundations&sort=forks');
  await expect(rows(page)).toHaveCount(3);
  await expect(page.locator('.sort select')).toHaveValue('forks');

  await search(page).fill('vue');
  await expect(names(page)).toHaveText(['vuejs/core']);
});

test('the detail drawer opens from a row and offers the understand-this-repo links', async ({
  page,
}) => {
  await openExplorer(page);
  await search(page).fill('kubernetes');
  await names(page).first().click();

  const drawer = page.getByRole('dialog', { name: 'kubernetes/kubernetes details' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('link', { name: /Explain/ })).toHaveAttribute(
    'href',
    'https://explaingithub.com/kubernetes/kubernetes',
  );
  await expect(drawer.getByRole('link', { name: /Diagram/ })).toHaveAttribute(
    'href',
    'https://gitdiagram.com/kubernetes/kubernetes',
  );
  await expect(drawer.getByRole('link', { name: /Ingest for AI/ })).toHaveAttribute(
    'href',
    'https://gitingest.com/kubernetes/kubernetes',
  );
  await expect(drawer.getByRole('link', { name: /Reverse prompt/ })).toHaveAttribute(
    'href',
    'https://gitreverse.com/kubernetes/kubernetes',
  );
  await expect(drawer.getByText('Maintenance')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
});

test('keyboard: "/" focuses search, j and k step through results', async ({ page }) => {
  await openExplorer(page);
  await page.locator('body').press('/');
  await expect(search(page)).toBeFocused();
  await search(page).blur();
  await page.keyboard.press('j');
  await page.keyboard.press('j');
  await expect(names(page).nth(1)).toBeFocused();
  await page.keyboard.press('k');
  await expect(names(page).nth(0)).toBeFocused();
});

test('saved repositories appear in lists, export as Markdown and share by link', async ({
  page,
  browser,
}) => {
  await openExplorer(page);
  await rows(page)
    .nth(0)
    .getByRole('button', { name: /^Save / })
    .click();
  await rows(page)
    .nth(1)
    .getByRole('button', { name: /^Save / })
    .click();

  await page.goto('/lists/');
  await expect(page.locator('.lists-main .row')).toHaveCount(2);

  await page.getByRole('button', { name: 'Export Markdown' }).click();
  await expect(page.locator('.copyable textarea')).toHaveValue(
    /^# Saved\n\n- \[codecrafters-io\/build-your-own-x\]/,
  );

  await page.getByRole('button', { name: 'Share link' }).click();
  const link = await page.locator('.copyable input').inputValue();
  expect(link).toContain('/lists/?s=Saved~');

  // Someone else, with nothing saved, opens the link.
  const context = await browser.newContext();
  const visitor = await context.newPage();
  await visitor.goto(link);
  await expect(visitor.locator('.shared-list .row')).toHaveCount(2);
  await visitor.getByRole('button', { name: 'Save a copy' }).click();
  await expect(visitor.locator('.lists-nav li')).toHaveCount(2);
  await expect(visitor).toHaveURL(/\/lists\/$/);
  await context.close();
});

test('compare: pick repositories, follow the tray, see the table and the chart', async ({
  page,
}) => {
  await openExplorer(page);
  await rows(page)
    .nth(0)
    .getByRole('button', { name: /comparison$/ })
    .click();
  await rows(page)
    .nth(2)
    .getByRole('button', { name: /comparison$/ })
    .click();

  await page.locator('.tray').getByRole('link', { name: 'Compare' }).click();
  await expect(page).toHaveURL(/\/compare\/\?r=/);
  await expect(page.locator('.compare-table thead th')).toHaveCount(3);
  await expect(page.locator('.compare-table td.is-best').first()).toBeVisible();
  await expect(page.getByRole('row', { name: /Latest release/ })).toBeVisible();

  // Two lines, with a legend so identity never rests on colour alone.
  const chart = page.locator('.compare .chart');
  await expect(chart.locator('.chart-line')).toHaveCount(2);
  await expect(chart.locator('.chart-legend li')).toHaveCount(2);

  await chart.locator('svg').focus();
  await expect(chart.locator('.chart-tooltip')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(chart.locator('.chart-tooltip p')).toHaveCount(3);
});

test('the command palette jumps to a repository', async ({ page }) => {
  await page.goto('/rising/');
  const palette = page.getByRole('dialog', { name: 'Quick search' });
  // The shortcut only works once the palette's script has loaded, so allow for that.
  await expect(async () => {
    await page.keyboard.press('Control+k');
    await expect(palette).toBeVisible({ timeout: 500 });
  }).toPass();

  await palette.getByRole('combobox').fill('next.js');
  await expect(palette.getByRole('option').first()).toContainText('vercel/next.js');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/repo\/vercel\/next\.js\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('next.js');
});
