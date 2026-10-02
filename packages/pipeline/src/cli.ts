import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { RawSnapshotSchema, SnapshotSchema, type Snapshot } from '@agr/schema';
import { loadCollections, loadTaxonomy } from './content';
import { renderDomainLists, updateReadme } from './export/markdown';
import { assertPlausibleCount, buildSnapshot } from './export/snapshot';
import { fetchAllRepositories } from './fetch/fetch-all';
import { GitHubClient } from './github/client';
import { HISTORY_LOOKBACK_DAYS, shiftDate } from './history/momentum';
import { readHistory, writeHistoryEntry } from './history/store';
import { fromRoot, readJson, writeFileAtomic } from './io';

const MINIMUM_STARS = 10_000;
const DEFAULT_RAW = 'data/raw/latest.json';
const DEFAULT_SITE_DIR = 'data/site';
const DEFAULT_HISTORY_DIR = 'data/history';

const USAGE = `Usage: npm run pipeline -- <command> [options]

Commands:
  fetch      Fetch every repository with ${MINIMUM_STARS.toLocaleString('en-US')}+ stars from GitHub.
               --out <file>           Raw snapshot to write (default ${DEFAULT_RAW})
             Uses GITHUB_TOKEN when set; without it the fetch is slower.

  build      Build the site snapshot from a raw snapshot.
               --from-raw <file>      Raw snapshot to read (default ${DEFAULT_RAW})
               --out <dir>            Output directory (default ${DEFAULT_SITE_DIR})
               --history-dir <dir>    Star history directory (default ${DEFAULT_HISTORY_DIR})
               --no-history           Neither read nor append history
               --force                Skip the repository-count sanity check

  readme     Regenerate the README top list and lists/*.md from the built snapshot.
  validate   Check the built snapshot against the schema.
  pull       Download the snapshot published by a deployed site.
               --url <site url>       Defaults to the SITE_URL environment variable

  fixture    Regenerate fixtures/sample-raw.json from a raw snapshot.
               --from-raw <file>      Raw snapshot to sample (default ${DEFAULT_RAW})
               --count <n>            Approximate sample size (default 300)
`;

function log(message: string): void {
  console.log(message);
}

function loadSnapshot(dir: string): Snapshot {
  const file = path.join(fromRoot(dir), 'snapshot.json');
  if (!existsSync(file))
    throw new Error(`No snapshot at ${file}. Run "npm run pipeline -- build" first.`);
  return SnapshotSchema.parse(readJson(file));
}

async function fetchCommand(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: { out: { type: 'string', default: DEFAULT_RAW } },
  });
  const client = new GitHubClient({ token: process.env.GITHUB_TOKEN, log });
  if (!client.authenticated)
    log('GITHUB_TOKEN is not set: fetching anonymously, which is about three times slower.');

  const started = Date.now();
  const raw = await fetchAllRepositories(client, { minimumStars: MINIMUM_STARS, log });
  const file = fromRoot(values.out);
  writeFileAtomic(file, `${JSON.stringify(raw)}\n`);
  const seconds = ((Date.now() - started) / 1_000).toFixed(0);
  log(
    `Fetched ${raw.repository_count.toLocaleString('en-US')} repositories in ${seconds}s -> ${file}`,
  );
}

function buildCommand(args: string[]): void {
  const { values } = parseArgs({
    args,
    options: {
      'from-raw': { type: 'string', default: DEFAULT_RAW },
      out: { type: 'string', default: DEFAULT_SITE_DIR },
      'history-dir': { type: 'string', default: DEFAULT_HISTORY_DIR },
      'no-history': { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
    },
  });

  const rawFile = fromRoot(values['from-raw']);
  if (!existsSync(rawFile)) {
    throw new Error(
      `No raw snapshot at ${rawFile}. Run "npm run pipeline -- fetch" or pass --from-raw.`,
    );
  }
  const raw = RawSnapshotSchema.parse(readJson(rawFile));
  const date = new Date(raw.generated_at).toISOString().slice(0, 10);
  const historyDir = fromRoot(values['history-dir']);
  const useHistory = !values['no-history'];

  const history = useHistory
    ? readHistory(historyDir, shiftDate(date, -HISTORY_LOOKBACK_DAYS))
    : [];
  const { snapshot, historyEntry, warnings } = buildSnapshot({
    raw,
    taxonomy: loadTaxonomy(fromRoot('content/taxonomy.json')),
    collections: loadCollections(fromRoot('content/collections')),
    history,
  });
  for (const warning of warnings) log(`Warning: ${warning}`);

  if (!values.force) {
    assertPlausibleCount(
      snapshot.repository_count,
      history.findLast((entry) => entry.date < date),
    );
  }
  if (useHistory) writeHistoryEntry(historyDir, historyEntry);

  const file = path.join(fromRoot(values.out), 'snapshot.json');
  writeFileAtomic(file, `${JSON.stringify(snapshot)}\n`);
  const other = snapshot.domains.find((domain) => domain.id === 'other')?.count ?? 0;
  log(
    `Built ${snapshot.repository_count.toLocaleString('en-US')} repositories for ${date} ` +
      `(${snapshot.history.days} day(s) of history, ${other} unclassified) -> ${file}`,
  );
}

function readmeCommand(args: string[]): void {
  const { values } = parseArgs({
    args,
    options: { data: { type: 'string', default: DEFAULT_SITE_DIR } },
  });
  const snapshot = loadSnapshot(values.data);

  const readmeFile = fromRoot('README.md');
  writeFileAtomic(readmeFile, updateReadme(readFileSync(readmeFile, 'utf8'), snapshot));
  const lists = renderDomainLists(snapshot);
  for (const [name, content] of lists) writeFileAtomic(fromRoot('lists', name), content);
  log(`Updated README.md and ${lists.size} files in lists/.`);
}

function validateCommand(args: string[]): void {
  const { values } = parseArgs({
    args,
    options: { data: { type: 'string', default: DEFAULT_SITE_DIR } },
  });
  const snapshot = loadSnapshot(values.data);
  log(`Snapshot is valid: ${snapshot.repository_count.toLocaleString('en-US')} repositories.`);
}

async function pullCommand(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: { url: { type: 'string' }, out: { type: 'string', default: DEFAULT_SITE_DIR } },
  });
  const site = values.url ?? process.env.SITE_URL;
  if (!site) throw new Error('Pass --url <site url> or set SITE_URL.');

  const url = new URL('data/snapshot.json', site.endsWith('/') ? site : `${site}/`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download ${url.href} (HTTP ${response.status}).`);
  const snapshot = SnapshotSchema.parse(await response.json());
  const file = path.join(fromRoot(values.out), 'snapshot.json');
  writeFileAtomic(file, `${JSON.stringify(snapshot)}\n`);
  log(`Pulled ${snapshot.repository_count.toLocaleString('en-US')} repositories -> ${file}`);
}

/** Cuts a raw snapshot down to a small, representative sample for tests and offline builds. */
function fixtureCommand(args: string[]): void {
  const { values } = parseArgs({
    args,
    options: {
      'from-raw': { type: 'string', default: DEFAULT_RAW },
      out: { type: 'string', default: 'fixtures/sample-raw.json' },
      count: { type: 'string', default: '300' },
    },
  });
  const raw = RawSnapshotSchema.parse(readJson(fromRoot(values['from-raw'])));
  const count = Number(values.count);
  const head = Math.floor(count * 0.4);
  const step = Math.max(1, Math.floor((raw.repositories.length - head) / (count - head)));
  const curated = new Set(
    loadCollections(fromRoot('content/collections')).flatMap((collection) =>
      collection.repositories.map((entry) => entry.name.toLowerCase()),
    ),
  );

  // The most-starred repositories, an even spread of the rest, and everything a collection names.
  const repositories = raw.repositories.filter(
    (repo, index) =>
      index < head || (index - head) % step === 0 || curated.has(repo.full_name.toLowerCase()),
  );
  const sample = { ...raw, repository_count: repositories.length, repositories };
  const file = fromRoot(values.out);
  writeFileAtomic(file, `${JSON.stringify(sample, null, 1)}\n`);
  log(`Wrote a ${repositories.length}-repository fixture -> ${file}`);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case 'fixture':
      return fixtureCommand(args);
    case 'fetch':
      return fetchCommand(args);
    case 'build':
      return buildCommand(args);
    case 'readme':
      return readmeCommand(args);
    case 'validate':
      return validateCommand(args);
    case 'pull':
      return pullCommand(args);
    default:
      console.log(USAGE);
      if (command !== undefined && command !== 'help' && command !== '--help') process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
