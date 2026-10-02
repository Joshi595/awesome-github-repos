import type { ResolvedCollection } from './collection';
import { ACTIVITY_STATUSES, MATURITY_STATUSES, type Activity, type Maturity } from './enums';
import type { Health, Repo } from './repo';
import type { HistoryMeta, Snapshot } from './snapshot';
import type { DomainSummary } from './taxonomy';

/**
 * The explorer's payload. Repositories are packed as positional rows with
 * languages, topics and domains replaced by dictionary indexes, which keeps
 * the download a fraction of the size of the full snapshot. Everything a row
 * leaves out is served on demand from the detail buckets.
 *
 * Browser code imports this module directly (`@agr/schema/site-index`); it
 * must only ever import types from the schema modules, never values.
 */

export const SITE_INDEX_VERSION = 2;
/** Topics used by fewer repositories than this are left out of the index dictionary. */
export const INDEX_TOPIC_MIN_COUNT = 2;
/** Number of detail files; a repository lives in bucket `id % DETAIL_BUCKET_COUNT`. */
export const DETAIL_BUCKET_COUNT = 64;

const DAY_MS = 86_400_000;
const FLAG_LICENSE = 1;
const FLAG_HOMEPAGE = 2;
const FLAG_ARCHIVED = 4;
const FLAG_NEW = 8;

export type IndexRow = [
  id: number,
  name: string,
  description: string,
  stars: number,
  forks: number,
  language: number,
  topics: number[],
  domains: number[],
  pushedDay: number,
  createdDay: number,
  flags: number,
  activity: number,
  maturity: number,
  d7: number | null,
  d30: number | null,
  rankDelta7: number | null,
];

export interface SiteIndex {
  v: typeof SITE_INDEX_VERSION;
  generated_at: string;
  minimum_stars: number;
  history: HistoryMeta;
  languages: string[];
  topics: string[];
  domains: DomainSummary[];
  collections: ResolvedCollection[];
  /** Sorted by stars, so a row's position is its rank minus one. */
  rows: IndexRow[];
}

/** A repository as the explorer works with it, decoded from an index row. */
export interface IndexRepo {
  id: number;
  rank: number;
  name: string;
  owner: string;
  repo: string;
  url: string;
  description: string;
  stars: number;
  forks: number;
  language: string | null;
  topics: string[];
  domains: string[];
  /** Epoch milliseconds, or `null` when GitHub reported no date. */
  pushedAt: number | null;
  createdAt: number | null;
  hasLicense: boolean;
  hasHomepage: boolean;
  archived: boolean;
  isNew: boolean;
  activity: Activity;
  maturity: Maturity;
  d7: number | null;
  d30: number | null;
  rankDelta7: number | null;
}

/** The lazily loaded remainder of a repository, used by the detail drawer. */
export interface RepoDetail {
  topics: string[];
  homepage: string | null;
  license: string | null;
  avatar_url: string | null;
  d1: number | null;
  spark: number[];
  similar: number[];
  health: Health;
}
export type DetailBucket = Record<string, RepoDetail>;

export function detailBucketOf(id: number): number {
  return id % DETAIL_BUCKET_COUNT;
}

function toDay(timestamp: string | null): number {
  if (!timestamp) return -1;
  const time = Date.parse(timestamp);
  return Number.isNaN(time) ? -1 : Math.floor(time / DAY_MS);
}

function fromDay(day: number): number | null {
  return day < 0 ? null : day * DAY_MS;
}

function countValues(values: Iterable<string>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

/** Most frequent first, ties alphabetical, so the dictionary doubles as a facet order. */
function rankedKeys(counts: Map<string, number>, minimum = 1): string[] {
  return [...counts]
    .filter(([, count]) => count >= minimum)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key]) => key);
}

export function encodeSiteIndex(snapshot: Snapshot): SiteIndex {
  const repos = snapshot.repositories;
  const languages = rankedKeys(
    countValues(repos.flatMap((repo) => (repo.language ? [repo.language] : []))),
  );
  const topics = rankedKeys(
    countValues(repos.flatMap((repo) => repo.topics)),
    INDEX_TOPIC_MIN_COUNT,
  );
  const languageIndex = new Map(languages.map((language, index) => [language, index]));
  const topicIndex = new Map(topics.map((topic, index) => [topic, index]));
  const domainIndex = new Map(snapshot.domains.map((domain, index) => [domain.id, index]));

  const rows = repos.map((repo): IndexRow => {
    const flags =
      (repo.license ? FLAG_LICENSE : 0) |
      (repo.homepage ? FLAG_HOMEPAGE : 0) |
      (repo.archived ? FLAG_ARCHIVED : 0) |
      (repo.momentum.is_new ? FLAG_NEW : 0);
    return [
      repo.id,
      repo.name,
      repo.description ?? '',
      repo.stars,
      repo.forks,
      repo.language ? (languageIndex.get(repo.language) ?? -1) : -1,
      repo.topics.flatMap((topic) => topicIndex.get(topic) ?? []),
      repo.domains.flatMap((domain) => domainIndex.get(domain) ?? []),
      toDay(repo.pushed_at),
      toDay(repo.created_at),
      flags,
      ACTIVITY_STATUSES.indexOf(repo.activity),
      MATURITY_STATUSES.indexOf(repo.maturity),
      repo.momentum.d7,
      repo.momentum.d30,
      repo.momentum.rank_delta_7,
    ];
  });

  return {
    v: SITE_INDEX_VERSION,
    generated_at: snapshot.generated_at,
    minimum_stars: snapshot.minimum_stars,
    history: snapshot.history,
    languages,
    topics,
    domains: snapshot.domains,
    collections: snapshot.collections,
    rows,
  };
}

export function decodeSiteIndex(index: SiteIndex): IndexRepo[] {
  if (index.v !== SITE_INDEX_VERSION) {
    throw new Error(`Unsupported site index version ${String(index.v)}.`);
  }
  return index.rows.map((row, position): IndexRepo => {
    const [
      id,
      name,
      description,
      stars,
      forks,
      language,
      topics,
      domains,
      pushedDay,
      createdDay,
      flags,
    ] = row;
    const slash = name.indexOf('/');
    return {
      id,
      rank: position + 1,
      name,
      owner: name.slice(0, slash),
      repo: name.slice(slash + 1),
      url: `https://github.com/${name}`,
      description,
      stars,
      forks,
      language: index.languages[language] ?? null,
      topics: topics.flatMap((topic) => index.topics[topic] ?? []),
      domains: domains.flatMap((domain) => index.domains[domain]?.id ?? []),
      pushedAt: fromDay(pushedDay),
      createdAt: fromDay(createdDay),
      hasLicense: (flags & FLAG_LICENSE) !== 0,
      hasHomepage: (flags & FLAG_HOMEPAGE) !== 0,
      archived: (flags & FLAG_ARCHIVED) !== 0,
      isNew: (flags & FLAG_NEW) !== 0,
      activity: ACTIVITY_STATUSES[row[11]] ?? 'unknown',
      maturity: MATURITY_STATUSES[row[12]] ?? 'unknown',
      d7: row[13],
      d30: row[14],
      rankDelta7: row[15],
    };
  });
}

export function toRepoDetail(repo: Repo): RepoDetail {
  return {
    topics: repo.topics,
    homepage: repo.homepage,
    license: repo.license,
    avatar_url: repo.avatar_url,
    d1: repo.momentum.d1,
    spark: repo.momentum.spark,
    similar: repo.similar,
    health: repo.health,
  };
}

/** Splits a snapshot's repositories into the `DETAIL_BUCKET_COUNT` detail files. */
export function encodeDetailBuckets(snapshot: Snapshot): DetailBucket[] {
  const buckets: DetailBucket[] = Array.from({ length: DETAIL_BUCKET_COUNT }, () => ({}));
  for (const repo of snapshot.repositories) {
    const bucket = buckets[detailBucketOf(repo.id)];
    if (bucket) bucket[String(repo.id)] = toRepoDetail(repo);
  }
  return buckets;
}
