import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  decodeSiteIndex,
  encodeDetailBuckets,
  encodeSiteIndex,
  SnapshotSchema,
  type DetailBucket,
  type IndexRepo,
  type Repo,
  type SiteIndex,
  type Snapshot,
} from '@agr/schema';
import { languageSlug } from './paths';

/** Build-time access to the snapshot produced by the pipeline. Never imported by browser code. */

const SNAPSHOT_FILE = 'snapshot.json';
/** A topic or language needs this many repositories to get its own page. */
export const TOPIC_PAGE_MIN = 10;
export const LANGUAGE_PAGE_MIN = 5;

function findSnapshot(): string {
  const candidates = [
    process.env.SITE_DATA_DIR,
    path.resolve(process.cwd(), 'data/site'),
    path.resolve(process.cwd(), '../../data/site'),
  ].filter((dir): dir is string => Boolean(dir));
  const found = candidates
    .map((dir) => path.join(dir, SNAPSHOT_FILE))
    .find((file) => existsSync(file));
  if (!found) {
    throw new Error(
      'No site data found. Run "npm run data:sample" for the bundled sample, ' +
        'or "npm run data:fetch" for live data, then build again.',
    );
  }
  return found;
}

let cached: Snapshot | null = null;

export function getSnapshot(): Snapshot {
  cached ??= SnapshotSchema.parse(JSON.parse(readFileSync(findSnapshot(), 'utf8')));
  return cached;
}

/** Snapshot time in epoch milliseconds: the "now" all ages are measured from. */
export function snapshotNow(): number {
  return Date.parse(getSnapshot().generated_at);
}

let byId: Map<number, Repo> | null = null;

export function repoById(id: number): Repo | undefined {
  byId ??= new Map(getSnapshot().repositories.map((repo) => [repo.id, repo]));
  return byId.get(id);
}

let siteIndex: SiteIndex | null = null;

/** The explorer payload, also served at /data/index.json. */
export function getSiteIndex(): SiteIndex {
  siteIndex ??= encodeSiteIndex(getSnapshot());
  return siteIndex;
}

let rows: IndexRepo[] | null = null;

/** The row model used by list components, for a repository from the snapshot. */
export function rowOf(repo: Repo): IndexRepo {
  rows ??= decodeSiteIndex(getSiteIndex());
  const row = rows[repo.rank - 1];
  if (!row || row.id !== repo.id) throw new Error(`No index row for ${repo.name}.`);
  return row;
}

let detailBuckets: DetailBucket[] | null = null;

export function getDetailBuckets(): DetailBucket[] {
  detailBuckets ??= encodeDetailBuckets(getSnapshot());
  return detailBuckets;
}

export interface Group {
  key: string;
  label: string;
  repos: Repo[];
}

let topics: Group[] | null = null;
let languages: Group[] | null = null;

/** Topics with enough repositories for a page, largest first. */
export function topicGroups(): Group[] {
  topics ??= buildTopicGroups();
  return topics;
}

/** Languages with enough repositories for a page; spelling variants share one slug. */
export function languageGroups(): Group[] {
  languages ??= buildLanguageGroups();
  return languages;
}

let topicKeys: Set<string> | null = null;

/** The topics that have their own page. */
export function topicPageKeys(): Set<string> {
  topicKeys ??= new Set(topicGroups().map((group) => group.key));
  return topicKeys;
}

function buildTopicGroups(): Group[] {
  const groups = new Map<string, Repo[]>();
  for (const repo of getSnapshot().repositories) {
    for (const topic of repo.topics) {
      const members = groups.get(topic);
      if (members) members.push(repo);
      else groups.set(topic, [repo]);
    }
  }
  return [...groups]
    .filter(([, repos]) => repos.length >= TOPIC_PAGE_MIN)
    .map(([topic, repos]) => ({ key: topic, label: topic, repos }))
    .sort((a, b) => b.repos.length - a.repos.length || a.key.localeCompare(b.key));
}

function buildLanguageGroups(): Group[] {
  const groups = new Map<string, Group>();
  for (const repo of getSnapshot().repositories) {
    if (!repo.language) continue;
    const key = languageSlug(repo.language);
    const group = groups.get(key);
    if (group) group.repos.push(repo);
    else groups.set(key, { key, label: repo.language, repos: [repo] });
  }
  return [...groups.values()]
    .filter((group) => group.repos.length >= LANGUAGE_PAGE_MIN)
    .sort((a, b) => b.repos.length - a.repos.length || a.key.localeCompare(b.key));
}
