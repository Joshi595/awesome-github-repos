import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

// On GitHub Pages a project site is served from /<repository>/; publish.yml passes both values.
export default defineConfig({
  site: process.env.SITE_URL ?? 'http://localhost:4321',
  base: process.env.BASE_PATH ?? '/',
  integrations: [
    preact(),
    // Compare and lists are per-visitor tools with nothing for a search engine to index.
    sitemap({ filter: (page) => !/\/(compare|lists|stars)\/$/.test(page) }),
  ],
  build: { format: 'directory' },
});
