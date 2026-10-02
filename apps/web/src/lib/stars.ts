import type { IndexRepo } from '@agr/schema';

/**
 * "Check my stars": compares the repositories a GitHub user has starred with
 * the list. Starred repositories are public, so this needs only a username and
 * runs entirely in the visitor's browser.
 */

const PER_PAGE = 100;
/** GitHub allows 60 unauthenticated requests an hour; this leaves room to retry. */
export const MAX_PAGES = 20;
export const USERNAME_PATTERN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

export type StarsError = 'not-found' | 'rate-limited' | 'network';

export interface StarsResult {
  /** Ids of every starred repository fetched, in or out of the list. */
  ids: number[];
  /** True when the user has more stars than were fetched. */
  truncated: boolean;
}

export class StarsFetchError extends Error {
  constructor(
    readonly kind: StarsError,
    /** When the rate limit resets, in epoch milliseconds, if GitHub said. */
    readonly resetAt: number | null = null,
  ) {
    super(kind);
  }
}

/** Fetches the ids of a user's starred repositories, newest first. */
export async function fetchStarredIds(
  username: string,
  onProgress: (count: number) => void = () => {},
  fetchImpl: typeof fetch = fetch,
): Promise<StarsResult> {
  const ids: number[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    let response: Response;
    try {
      response = await fetchImpl(
        `https://api.github.com/users/${encodeURIComponent(username)}/starred?per_page=${PER_PAGE}&page=${page}`,
        { headers: { Accept: 'application/vnd.github+json' } },
      );
    } catch {
      throw new StarsFetchError('network');
    }
    if (response.status === 404) throw new StarsFetchError('not-found');
    if (response.status === 403 || response.status === 429) {
      const reset = Number(response.headers.get('x-ratelimit-reset'));
      throw new StarsFetchError('rate-limited', reset > 0 ? reset * 1_000 : null);
    }
    if (!response.ok) throw new StarsFetchError('network');

    const items = (await response.json()) as { id?: unknown }[];
    for (const item of items) if (typeof item.id === 'number') ids.push(item.id);
    onProgress(ids.length);
    if (items.length < PER_PAGE) return { ids, truncated: false };
  }
  return { ids, truncated: true };
}

export interface StarsSummary<T extends IndexRepo> {
  /** Starred repositories that are in the list, most stars first. */
  starred: T[];
  /** Starred repositories gaining stars fastest. */
  rising: T[];
  /** The most-starred repositories the user has not starred. */
  missing: T[];
  /** Unstarred repositories closest to the user's taste. */
  recommended: T[];
  /** Domain ids with how many starred repositories fall in each, largest first. */
  domains: [string, number][];
}

const LIST_LIMIT = 20;
const RISING_LIMIT = 10;

/**
 * Scores every unstarred repository by how much its topics overlap the topics
 * of what the user starred. A topic counts for more the more of their stars
 * carry it and the rarer it is overall, so `rust` + `tui` beats `javascript`.
 */
export function recommend<T extends IndexRepo>(
  starred: readonly T[],
  all: readonly T[],
  limit = LIST_LIMIT,
): T[] {
  const taste = new Map<string, number>();
  for (const repo of starred) {
    for (const topic of repo.topics) taste.set(topic, (taste.get(topic) ?? 0) + 1);
  }
  if (taste.size === 0) return [];

  const frequency = new Map<string, number>();
  for (const repo of all) {
    for (const topic of repo.topics) frequency.set(topic, (frequency.get(topic) ?? 0) + 1);
  }
  const starredIds = new Set(starred.map((repo) => repo.id));

  return all
    .filter((repo) => !starredIds.has(repo.id) && !repo.archived)
    .map((repo) => {
      const score = repo.topics.reduce((sum, topic) => {
        const weight = taste.get(topic);
        return weight ? sum + weight * Math.log(all.length / (frequency.get(topic) ?? 1)) : sum;
      }, 0);
      // Dividing by the topic count stops repositories with thirty topics matching everyone.
      return { repo, score: score / Math.sqrt(repo.topics.length || 1) };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.repo.rank - b.repo.rank)
    .slice(0, limit)
    .map((entry) => entry.repo);
}

export function summariseStars<T extends IndexRepo>(
  ids: readonly number[],
  all: readonly T[],
): StarsSummary<T> {
  const wanted = new Set(ids);
  const starred = all.filter((repo) => wanted.has(repo.id));
  const domains = new Map<string, number>();
  for (const repo of starred) {
    const primary = repo.domains[0];
    if (primary) domains.set(primary, (domains.get(primary) ?? 0) + 1);
  }
  return {
    starred,
    rising: starred
      .filter((repo) => repo.d7 !== null && repo.d7 > 0)
      .sort((a, b) => (b.d7 ?? 0) - (a.d7 ?? 0))
      .slice(0, RISING_LIMIT),
    missing: all.filter((repo) => !wanted.has(repo.id)).slice(0, LIST_LIMIT),
    recommended: recommend(starred, all),
    domains: [...domains].sort((a, b) => b[1] - a[1]),
  };
}
