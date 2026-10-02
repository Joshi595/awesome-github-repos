import type { Activity, IndexRepo, ResolvedCollection } from '@agr/schema';
import { scoreMatch, tokenize, type SearchDoc } from './search';

export const SORT_KEYS = ['stars', 'gain7', 'forks', 'pushed', 'created'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const SORT_LABELS: Record<SortKey, string> = {
  stars: 'Most stars',
  gain7: 'Fastest rising (7d)',
  forks: 'Most forks',
  pushed: 'Recently active',
  created: 'Newest',
};

export const ACTIVITY_FILTERS = [
  'active',
  'maintained',
  'quiet',
] as const satisfies readonly Activity[];
export const AGE_FILTERS = ['emerging', 'established'] as const;
export type AgeFilter = (typeof AGE_FILTERS)[number];
/** Selectable star floors above the snapshot's own minimum. */
export const STAR_FLOORS = [25_000, 50_000, 100_000] as const;

export interface Filters {
  q: string;
  /** Any of these domains. */
  domains: string[];
  /** Any of these languages. */
  languages: string[];
  /** All of these topics. */
  topics: string[];
  activity: Activity[];
  age: AgeFilter[];
  /** 0 means the snapshot's own minimum. */
  minStars: number;
  collection: string;
  onlyNew: boolean;
  sort: SortKey;
}

export const DEFAULT_FILTERS: Filters = {
  q: '',
  domains: [],
  languages: [],
  topics: [],
  activity: [],
  age: [],
  minStars: 0,
  collection: '',
  onlyNew: false,
  sort: 'stars',
};

/** A repository plus its precomputed search text. */
export type ExplorerRepo = IndexRepo & { doc: SearchDoc };

/** True when nothing narrows the list (the sort order does not count). */
export function isUnfiltered(filters: Filters): boolean {
  return (
    filters.q.trim() === '' &&
    filters.domains.length === 0 &&
    filters.languages.length === 0 &&
    filters.topics.length === 0 &&
    filters.activity.length === 0 &&
    filters.age.length === 0 &&
    filters.minStars === 0 &&
    filters.collection === '' &&
    !filters.onlyNew
  );
}

function nullsLast(a: number | null, b: number | null): number {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return b - a;
}

const COMPARATORS: Record<SortKey, (a: ExplorerRepo, b: ExplorerRepo) => number> = {
  stars: (a, b) => a.rank - b.rank,
  gain7: (a, b) => nullsLast(a.d7, b.d7) || a.rank - b.rank,
  forks: (a, b) => b.forks - a.forks || a.rank - b.rank,
  pushed: (a, b) => nullsLast(a.pushedAt, b.pushedAt) || a.rank - b.rank,
  created: (a, b) => nullsLast(a.createdAt, b.createdAt) || a.rank - b.rank,
};

/**
 * Applies every filter and returns the matches in display order. With a
 * search query and the default sort, the best text matches come first.
 */
export function filterRepos(
  repos: readonly ExplorerRepo[],
  filters: Filters,
  collections: readonly ResolvedCollection[] = [],
): ExplorerRepo[] {
  const tokens = tokenize(filters.q);
  const domains = new Set(filters.domains);
  const languages = new Set(filters.languages);
  const activity = new Set<string>(filters.activity);
  const wantsEmerging = filters.age.includes('emerging');
  const wantsEstablished = filters.age.includes('established');
  const collection = filters.collection
    ? collections.find((candidate) => candidate.id === filters.collection)
    : undefined;
  // An unknown collection id matches nothing rather than silently matching everything.
  const members = filters.collection ? new Set(collection?.entries.map((entry) => entry.id)) : null;

  const scores = new Map<number, number>();
  const matches = repos.filter((repo) => {
    if (repo.stars < filters.minStars) return false;
    if (members && !members.has(repo.id)) return false;
    if (filters.onlyNew && !repo.isNew) return false;
    if (languages.size > 0 && (repo.language === null || !languages.has(repo.language)))
      return false;
    if (domains.size > 0 && !repo.domains.some((domain) => domains.has(domain))) return false;
    if (!filters.topics.every((topic) => repo.topics.includes(topic))) return false;
    if (activity.size > 0 && !activity.has(repo.activity)) return false;
    if (wantsEmerging !== wantsEstablished) {
      const emerging = repo.maturity === 'emerging';
      if (repo.maturity === 'unknown' || emerging !== wantsEmerging) return false;
    }
    if (tokens.length > 0) {
      const score = scoreMatch(repo.doc, tokens);
      if (score === 0) return false;
      scores.set(repo.id, score);
    }
    return true;
  });

  const comparator = COMPARATORS[filters.sort];
  if (tokens.length > 0 && filters.sort === 'stars') {
    return matches.sort(
      (a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || comparator(a, b),
    );
  }
  return matches.sort(comparator);
}

/** One removable piece of the current filter state, as shown in the chip bar. */
export interface Chip {
  key: 'q' | 'domain' | 'language' | 'topic' | 'activity' | 'age' | 'stars' | 'collection' | 'new';
  value: string;
}

export function activeChips(filters: Filters): Chip[] {
  return [
    ...(filters.q.trim() ? [{ key: 'q', value: filters.q.trim() } as const] : []),
    ...(filters.collection ? [{ key: 'collection', value: filters.collection } as const] : []),
    ...filters.domains.map((value) => ({ key: 'domain', value }) as const),
    ...filters.languages.map((value) => ({ key: 'language', value }) as const),
    ...filters.topics.map((value) => ({ key: 'topic', value }) as const),
    ...filters.activity.map((value) => ({ key: 'activity', value }) as const),
    ...filters.age.map((value) => ({ key: 'age', value }) as const),
    ...(filters.minStars > 0 ? [{ key: 'stars', value: String(filters.minStars) } as const] : []),
    ...(filters.onlyNew ? [{ key: 'new', value: 'new' } as const] : []),
  ];
}

export function removeChip(filters: Filters, chip: Chip): Filters {
  const without = <T extends string>(list: T[]) => list.filter((item) => item !== chip.value);
  switch (chip.key) {
    case 'q':
      return { ...filters, q: '' };
    case 'collection':
      return { ...filters, collection: '' };
    case 'domain':
      return { ...filters, domains: without(filters.domains) };
    case 'language':
      return { ...filters, languages: without(filters.languages) };
    case 'topic':
      return { ...filters, topics: without(filters.topics) };
    case 'activity':
      return { ...filters, activity: without(filters.activity) };
    case 'age':
      return { ...filters, age: without(filters.age) };
    case 'stars':
      return { ...filters, minStars: 0 };
    case 'new':
      return { ...filters, onlyNew: false };
  }
}

/** Adds the value to the list, or removes it when already present. */
export function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}
