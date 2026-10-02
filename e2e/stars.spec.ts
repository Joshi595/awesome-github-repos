import { expect, test } from '@playwright/test';

const STARRED_API = 'https://api.github.com/users/*/starred*';

test("shows how a user's stars line up with the list", async ({ page, request }) => {
  // Stand in for GitHub: this user has starred three repositories from the list and one outside it.
  const index = (await (await request.get('/data/index.json')).json()) as {
    rows: [number, string][];
  };
  const picked = ['kubernetes/kubernetes', 'vercel/next.js', 'BurntSushi/ripgrep'];
  const ids = index.rows.filter(([, name]) => picked.includes(name)).map(([id]) => id);
  expect(ids).toHaveLength(3);
  await page.route(STARRED_API, (route) =>
    route.fulfill({
      json: [...ids, 4242].map((id) => ({ id })),
      headers: { 'access-control-allow-origin': '*' },
    }),
  );

  await page.goto('/stars/');
  await page.getByRole('textbox', { name: 'GitHub username' }).fill('octocat');
  await page.getByRole('button', { name: 'Check stars' }).click();

  const stat = (label: string) => page.locator('.stat').filter({ hasText: label }).locator('dd');
  await expect(stat('Stars read')).toHaveText('4');
  await expect(stat('In this list')).toHaveText('3');
  await expect(
    page.getByRole('heading', { name: 'Most-starred you have not starred' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'You might like' })).toBeVisible();
  const mine = page
    .locator('section')
    .filter({ hasText: 'Your stars in the list' })
    .locator('.row-name');
  await expect(mine).toHaveCount(3);

  await page.getByRole('button', { name: /Save these 3 as a list/ }).click();
  await page.getByRole('link', { name: 'Open your lists' }).click();
  await expect(page.locator('.lists-nav')).toContainText("octocat's stars");
});

test('explains an unknown user, a rate limit and a bad username', async ({ page }) => {
  await page.goto('/stars/');
  const input = page.getByRole('textbox', { name: 'GitHub username' });
  const submit = page.getByRole('button', { name: 'Check stars' });

  await input.fill('not a name');
  await submit.click();
  await expect(page.getByRole('alert')).toContainText('not a valid GitHub username');

  await page.route(STARRED_API, (route) => route.fulfill({ status: 404, json: {} }));
  await input.fill('ghost-user');
  await submit.click();
  await expect(page.getByRole('alert')).toContainText('no user called');

  await page.unroute(STARRED_API);
  await page.route(STARRED_API, (route) => route.fulfill({ status: 403, json: {} }));
  await submit.click();
  await expect(page.getByRole('alert')).toContainText('hourly limit');
});
