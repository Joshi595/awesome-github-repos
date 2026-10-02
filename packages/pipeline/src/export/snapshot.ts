import {
  OTHER_DOMAIN_ID,
  SNAPSHOT_SCHEMA_VERSION,
  SnapshotSchema,
  type Collection,
  type DomainSummary,
  type HistoryEntry,
  type Momentum,
  type NameMap,
  type RawSnapshot,
  type Repo,
  type ResolvedCollection,
  type Snapshot,
  type Taxonomy,
  type WeeklyReport,
} from '@agr/schema';
import { byStarsDescending } from '../fetch/fetch-all';
import { computeMomentum, historyMeta } from '../history/momentum';
import { createHistoryEntry } from '../history/store';
import { updateWeeklyReports } from '../history/weekly';
import { createClassifier } from '../transform/classify';
import { normalizeRepo } from '../transform/normalize';
import { computeSimilar } from '../transform/similar';

/** A count this far below the previous snapshot means the fetch went wrong, not that repos vanished. */
export const MAX_COUNT_DROP = 0.05;

const NO_MOMENTUM: Momentum = {
  d1: null,
  d7: null,
  d30: null,
  rank_delta_7: null,
  is_new: false,
  spark: [],
};

export interface BuildInput {
  raw: RawSnapshot;
  taxonomy: Taxonomy;
  collections: readonly Collection[];
  /** Entries from earlier days. The snapshot's own day is derived from `raw`. */
  history: readonly HistoryEntry[];
  /** Weekly reports finalised by earlier runs. */
  weekly?: readonly WeeklyReport[];
  /** Repository names seen by earlier runs. */
  names?: NameMap;
}

export interface BuildResult {
  snapshot: Snapshot;
  /** The entry to append to the history store for the snapshot's day. */
  historyEntry: HistoryEntry;
  /** Reports for weeks that have just ended, to be stored. */
  weeklyToStore: WeeklyReport[];
  /** `names` extended with every repository in this snapshot. */
  names: NameMap;
  warnings: string[];
}

/** Throws when the new repository count has collapsed relative to the last recorded day. */
export function assertPlausibleCount(count: number, previous: HistoryEntry | undefined): void {
  if (!previous || previous.count === 0) return;
  const drop = (previous.count - count) / previous.count;
  if (drop > MAX_COUNT_DROP) {
    throw new Error(
      `Repository count fell from ${previous.count} (${previous.date}) to ${count}, ` +
        `more than the ${MAX_COUNT_DROP * 100}% allowed. Refusing to publish; pass --force to override.`,
    );
  }
}

function resolveCollections(
  collections: readonly Collection[],
  repos: readonly Repo[],
  warnings: string[],
): ResolvedCollection[] {
  const idByName = new Map(repos.map((repo) => [repo.name.toLowerCase(), repo.id]));
  return collections.map((collection) => ({
    id: collection.id,
    title: collection.title,
    audience: collection.audience,
    description: collection.description,
    last_reviewed: collection.last_reviewed,
    entries: collection.repositories.flatMap((entry) => {
      const id = idByName.get(entry.name.toLowerCase());
      if (id === undefined) {
        // A renamed or de-listed repository must not take the daily publish down with it.
        warnings.push(
          `Collection "${collection.id}" references "${entry.name}", which is not in the snapshot.`,
        );
        return [];
      }
      return [{ id, note: entry.note }];
    }),
  }));
}

function summariseDomains(taxonomy: Taxonomy, repos: readonly Repo[]): DomainSummary[] {
  const counts = new Map<string, number>();
  for (const repo of repos) {
    for (const domain of repo.domains) counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }
  const summaries = taxonomy.domains.map((domain) => ({
    id: domain.id,
    label: domain.label,
    description: domain.description,
    count: counts.get(domain.id) ?? 0,
  }));
  summaries.push({
    id: OTHER_DOMAIN_ID,
    label: 'Other',
    description: 'Projects without a strong domain signal.',
    count: counts.get(OTHER_DOMAIN_ID) ?? 0,
  });
  return summaries;
}

/** Turns a raw fetch into the validated snapshot the site is built from. */
export function buildSnapshot(input: BuildInput): BuildResult {
  const { raw, taxonomy } = input;
  const now = new Date(raw.generated_at);
  if (Number.isNaN(now.getTime())) throw new Error(`Invalid generated_at "${raw.generated_at}".`);
  const date = now.toISOString().slice(0, 10);
  const warnings: string[] = [];

  const classify = createClassifier(taxonomy);
  const base = [...raw.repositories]
    .filter((repo) => repo.stargazers_count >= raw.minimum_stars)
    .sort(byStarsDescending)
    .map((repo) => normalizeRepo(repo, classify, now));

  const historyEntry = createHistoryEntry(date, base);
  const earlier = input.history.filter((entry) => entry.date < date);
  const momentum = computeMomentum(historyEntry, earlier);
  const similar = computeSimilar(base);

  const repositories: Repo[] = base.map((repo, index) => ({
    ...repo,
    rank: index + 1,
    momentum: momentum.get(repo.id) ?? NO_MOMENTUM,
    similar: similar.get(repo.id) ?? [],
  }));

  const names: NameMap = { ...input.names };
  for (const repo of repositories) names[String(repo.id)] = repo.name;
  const weekly = updateWeeklyReports({
    current: historyEntry,
    history: earlier,
    stored: input.weekly ?? [],
    names,
  });

  const snapshot = SnapshotSchema.parse({
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    generated_at: raw.generated_at,
    minimum_stars: raw.minimum_stars,
    repository_count: repositories.length,
    history: historyMeta(historyEntry, earlier),
    domains: summariseDomains(taxonomy, repositories),
    collections: resolveCollections(input.collections, repositories, warnings),
    weekly: weekly.reports,
    repositories,
  } satisfies Snapshot);

  return { snapshot, historyEntry, weeklyToStore: weekly.toStore, names, warnings };
}
