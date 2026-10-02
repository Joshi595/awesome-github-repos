import { RawRepoSchema, type RawRepo, type RawSnapshot } from '@agr/schema';
import type { SearchResponse } from '../github/client';
import { rangeQuery, splitRanges } from './star-ranges';

const PER_PAGE = 100;

/** The part of the GitHub client the fetch needs; lets tests supply a fake. */
export interface RepositorySearch {
  searchRepositories(query: string, page?: number, perPage?: number): Promise<SearchResponse>;
}

export interface FetchOptions {
  minimumStars: number;
  log?: (message: string) => void;
  now?: () => Date;
}

/** Highest stars first; ties broken by id so the order is deterministic. */
export function byStarsDescending(a: RawRepo, b: RawRepo): number {
  return b.stargazers_count - a.stargazers_count || a.id - b.id;
}

async function fetchRange(
  search: RepositorySearch,
  min: number,
  max: number | null,
): Promise<RawRepo[]> {
  const query = rangeQuery(min, max);
  const repos: RawRepo[] = [];
  for (let page = 1; ; page += 1) {
    const response = await search.searchRepositories(query, page, PER_PAGE);
    for (const item of response.items) repos.push(RawRepoSchema.parse(item));
    if (response.items.length < PER_PAGE || page * PER_PAGE >= response.total_count) break;
  }
  return repos;
}

/** Fetches every public repository at or above the star threshold. */
export async function fetchAllRepositories(
  search: RepositorySearch,
  options: FetchOptions,
): Promise<RawSnapshot> {
  const { minimumStars } = options;
  const log = options.log ?? (() => {});
  const format = (value: number) => value.toLocaleString('en-US');

  const top = await search.searchRepositories(rangeQuery(minimumStars, null), 1, 1);
  const byId = new Map<number, RawRepo>();

  if (top.total_count > 0) {
    const first = top.items[0];
    if (first === undefined) {
      throw new Error('GitHub returned no repository details for a non-empty search.');
    }
    const highestStars = RawRepoSchema.parse(first).stargazers_count;
    const ranges = await splitRanges(
      async (min, max) => (await search.searchRepositories(rangeQuery(min, max), 1, 1)).total_count,
      minimumStars,
      highestStars,
    );

    for (const [index, range] of ranges.entries()) {
      // The top range has no upper bound: the leading repositories keep gaining stars while
      // we work, and a cap read a moment ago would silently drop whichever one just passed it.
      const max = index === 0 ? null : range.max;
      log(
        `Fetching ${format(range.count)} repositories with ${format(range.min)} ` +
          `${max === null ? 'or more' : `to ${format(max)}`} stars...`,
      );
      for (const repo of await fetchRange(search, range.min, max)) {
        // Star counts move while we page, so a repository can show up twice or dip below the bar.
        if (repo.stargazers_count >= minimumStars) byId.set(repo.id, repo);
      }
    }
  }

  const repositories = [...byId.values()].sort(byStarsDescending);
  return {
    generated_at: (options.now?.() ?? new Date()).toISOString(),
    minimum_stars: minimumStars,
    repository_count: repositories.length,
    repositories,
  };
}
