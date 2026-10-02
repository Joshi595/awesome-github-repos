import { describe, expect, it } from 'vitest';
import { fetchAllRepositories } from '../src/fetch/fetch-all';
import { rangeQuery, splitRanges } from '../src/fetch/star-ranges';
import { FakeSearch, rawRepo } from './helpers';

describe('rangeQuery', () => {
  it('builds open and closed star ranges', () => {
    expect(rangeQuery(10_000, null)).toBe('stars:>=10000');
    expect(rangeQuery(10_000, 20_000)).toBe('stars:10000..20000');
  });
});

describe('splitRanges', () => {
  const stars = Array.from({ length: 3_500 }, (_, index) => 10_000 + index * 7);
  const count = async (min: number, max: number) =>
    stars.filter((value) => value >= min && value <= max).length;

  it('keeps every range within the cap and covers the whole span exactly once', async () => {
    const ranges = await splitRanges(count, 10_000, 40_000, 1_000);

    expect(ranges.every((range) => range.count <= 1_000)).toBe(true);
    expect(ranges.reduce((sum, range) => sum + range.count, 0)).toBe(stars.length);
    // Highest stars first, with no gaps or overlaps between neighbours.
    for (let index = 1; index < ranges.length; index += 1) {
      expect(ranges[index]?.max).toBe((ranges[index - 1]?.min ?? 0) - 1);
    }
  });

  it('returns nothing for an empty span', async () => {
    expect(await splitRanges(async () => 0, 1, 100)).toEqual([]);
  });

  it('fails clearly when a single star value exceeds the cap', async () => {
    await expect(splitRanges(async () => 5_000, 10_000, 10_000, 1_000)).rejects.toThrow(
      /exactly 10,000 stars/,
    );
  });
});

describe('fetchAllRepositories', () => {
  it('retrieves more repositories than one query can return, sorted and de-duplicated', async () => {
    const repos = Array.from({ length: 2_600 }, (_, index) =>
      rawRepo(index + 1, 10_000 + index * 3),
    );
    const below = rawRepo(9_999, 9_000);
    const snapshot = await fetchAllRepositories(new FakeSearch([...repos, below]), {
      minimumStars: 10_000,
      now: () => new Date('2026-10-02T00:00:00Z'),
    });

    expect(snapshot.repository_count).toBe(2_600);
    expect(new Set(snapshot.repositories.map((repo) => repo.id)).size).toBe(2_600);
    expect(snapshot.repositories[0]?.stargazers_count).toBe(10_000 + 2_599 * 3);
    expect(snapshot.repositories.at(-1)?.stargazers_count).toBe(10_000);
    expect(snapshot.generated_at).toBe('2026-10-02T00:00:00.000Z');
  });

  it('keeps the top repository when it gains stars during the fetch', async () => {
    const leader = rawRepo(1, 500_000);
    const search = new FakeSearch([leader, rawRepo(2, 300_000), rawRepo(3, 20_000)]);
    const original = search.searchRepositories.bind(search);
    // After the first request (which reads the highest star count), the leader moves past it.
    search.searchRepositories = async (...args) => {
      const response = await original(...args);
      leader.stargazers_count = 500_050;
      return response;
    };

    const snapshot = await fetchAllRepositories(search, { minimumStars: 10_000 });
    expect(snapshot.repositories.map((repo) => repo.id)).toEqual([1, 2, 3]);
    expect(snapshot.repositories[0]?.stargazers_count).toBe(500_050);
  });

  it('strips fields the project does not use', async () => {
    const noisy = { ...rawRepo(1, 20_000), forks_url: 'https://api.github.com/x', watchers: 5 };
    const snapshot = await fetchAllRepositories(new FakeSearch([noisy]), { minimumStars: 10_000 });
    expect(snapshot.repositories[0]).not.toHaveProperty('forks_url');
  });

  it('handles an empty result', async () => {
    const snapshot = await fetchAllRepositories(new FakeSearch([]), { minimumStars: 10_000 });
    expect(snapshot.repositories).toEqual([]);
  });
});
