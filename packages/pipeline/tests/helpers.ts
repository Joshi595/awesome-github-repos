import { RawSnapshotSchema, type RawRepo, type RawSnapshot } from '@agr/schema';
import { loadCollections, loadTaxonomy } from '../src/content';
import type { RepositorySearch } from '../src/fetch/fetch-all';
import type { SearchResponse } from '../src/github/client';
import { fromRoot, readJson } from '../src/io';

export const taxonomy = loadTaxonomy(fromRoot('content/taxonomy.json'));
export const collections = loadCollections(fromRoot('content/collections'));

export function loadFixture(): RawSnapshot {
  return RawSnapshotSchema.parse(readJson(fromRoot('fixtures/sample-raw.json')));
}

export function rawRepo(id: number, stars: number, overrides: Partial<RawRepo> = {}): RawRepo {
  return {
    id,
    full_name: `owner${id}/repo${id}`,
    html_url: `https://github.com/owner${id}/repo${id}`,
    description: null,
    stargazers_count: stars,
    forks_count: 0,
    language: null,
    topics: [],
    owner: { login: `owner${id}`, avatar_url: null },
    homepage: null,
    license: null,
    created_at: '2020-01-01T00:00:00Z',
    pushed_at: '2026-09-01T00:00:00Z',
    archived: false,
    ...overrides,
  };
}

/** An in-memory stand-in for GitHub search that enforces the 1,000-result cap. */
export class FakeSearch implements RepositorySearch {
  calls = 0;

  constructor(private readonly repos: RawRepo[]) {}

  async searchRepositories(query: string, page = 1, perPage = 1): Promise<SearchResponse> {
    this.calls += 1;
    const open = /^stars:>=(\d+)$/.exec(query);
    const closed = /^stars:(\d+)\.\.(\d+)$/.exec(query);
    const min = Number(open?.[1] ?? closed?.[1]);
    const max = closed ? Number(closed[2]) : Number.POSITIVE_INFINITY;
    const matches = this.repos
      .filter((repo) => repo.stargazers_count >= min && repo.stargazers_count <= max)
      .sort((a, b) => b.stargazers_count - a.stargazers_count);
    const start = (page - 1) * perPage;
    return {
      total_count: matches.length,
      incomplete_results: false,
      items: matches.slice(0, 1_000).slice(start, start + perPage),
    };
  }
}
