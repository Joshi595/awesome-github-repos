import { defineConfig, devices } from '@playwright/test';

const PORT = 4399;

/**
 * End-to-end tests run against the built site, served by `astro preview`.
 * Build it from the bundled sample first: `npm run data:sample && npm run build`.
 *
 * Set PLAYWRIGHT_CHANNEL=chrome (or msedge) to drive a browser already on the
 * machine instead of downloading Playwright's own.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: process.env.PLAYWRIGHT_CHANNEL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: {
    command: `npm run preview -w @agr/web -- --port ${PORT} --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
