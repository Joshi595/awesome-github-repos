import { describe, expect, it } from 'vitest';
import type { IndexRepo } from '@agr/schema';
import { alignToDates, dayNumber, gainSinceCommonStart, niceTicks } from '../src/lib/chart';
import { weekPath } from '../src/lib/paths';
import { REPO_TOOLS, repoToolLinks } from '../src/lib/repo-tools';
import { buildVocabulary, correctQuery, editDistance } from '../src/lib/search';
import type { StarsFetchError } from '../src/lib/stars';
import {
  fetchStarredIds,
  MAX_PAGES,
  recommend,
  summariseStars,
  USERNAME_PATTERN,
} from '../src/lib/stars';
import { weekBasis, weekRange, weekSummary, weekTitle } from '../src/lib/weekly';

function repo(id: number, name: string, overrides: Partial<IndexRepo> = {}): IndexRepo {
  const [owner = '', short = ''] = name.split('/');
  return {
    id,
    rank: id,
    name,
    owner,
    repo: short,
    url: `https://github.com/${name}`,
    description: '',
    stars: 100_000 - id * 1_000,
    forks: 0,
    language: null,
    topics: [],
    domains: ['other'],
    pushedAt: null,
    createdAt: null,
    hasLicense: false,
    hasHomepage: false,
    archived: false,
    isNew: false,
    activity: 'active',
    maturity: 'established',
    d7: null,
    d30: null,
    rankDelta7: null,
    ...overrides,
  };
}

describe('repo tools', () => {
  it('builds one link per tool by swapping the domain', () => {
    const links = repoToolLinks('vercel/next.js');
    expect(links.map((link) => link.url)).toEqual([
      'https://explaingithub.com/vercel/next.js',
      'https://gitdiagram.com/vercel/next.js',
      'https://gitingest.com/vercel/next.js',
      'https://gitreverse.com/vercel/next.js',
    ]);
    expect(links).toHaveLength(REPO_TOOLS.length);
  });
});

describe('chart helpers', () => {
  it('picks round ticks that enclose the data', () => {
    expect(niceTicks(513_200, 516_900)).toEqual([513_000, 514_000, 515_000, 516_000, 517_000]);
    expect(niceTicks(0, 87)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(-40, 260)).toEqual([-100, 0, 100, 200, 300]);
  });

  it('copes with a flat series and fractional steps', () => {
    const flat = niceTicks(1_000, 1_000);
    expect(flat[0]).toBeLessThan(1_000);
    expect(flat.at(-1)).toBeGreaterThan(1_000);
    expect(niceTicks(0, 1)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it('pads a short history at the start, since the samples are the latest ones', () => {
    const dates = ['2026-09-17', '2026-09-24', '2026-10-01'];
    expect(alignToDates([5, 6], dates)).toEqual([null, 5, 6]);
    expect(alignToDates([4, 5, 6], dates)).toEqual([4, 5, 6]);
    expect(alignToDates([3, 4, 5, 6], dates)).toEqual([4, 5, 6]);
  });

  it('re-bases series to the first date they all share', () => {
    const dates = ['2026-09-17', '2026-09-24', '2026-10-01'];
    const result = gainSinceCommonStart(
      [
        { label: 'big', values: [500_000, 500_400, 501_000] },
        { label: 'new', values: [null, 10_000, 10_900] },
      ],
      dates,
    );
    expect(result).toEqual({
      dates: ['2026-09-24', '2026-10-01'],
      series: [
        { label: 'big', values: [0, 600] },
        { label: 'new', values: [0, 900] },
      ],
    });
  });

  it('gives up when there are not two shared dates', () => {
    const dates = ['2026-09-24', '2026-10-01'];
    expect(gainSinceCommonStart([{ label: 'a', values: [null, 5] }], dates)).toBeNull();
    expect(gainSinceCommonStart([{ label: 'a', values: [null, null] }], dates)).toBeNull();
    expect(gainSinceCommonStart([], dates)).toBeNull();
  });

  it('spaces dates by real time', () => {
    expect(dayNumber('2026-10-02') - dayNumber('2026-09-17')).toBe(15);
  });
});

describe('query correction', () => {
  const vocabulary = buildVocabulary([
    {
      name: 'kubernetes/kubernetes',
      repo: 'kubernetes',
      description: '',
      language: 'Go',
      topics: ['containers'],
    },
    {
      name: 'kubernetes/minikube',
      repo: 'minikube',
      description: '',
      language: 'Go',
      topics: ['kubernetes'],
    },
    {
      name: 'facebook/react',
      repo: 'react',
      description: '',
      language: 'JavaScript',
      topics: ['frontend', 'ui'],
    },
    {
      name: 'tensorflow/tensorflow',
      repo: 'tensorflow',
      description: '',
      language: 'C++',
      topics: ['machine-learning'],
    },
  ]);

  it('measures edit distance up to a limit', () => {
    expect(editDistance('kubernetes', 'kubernetes', 2)).toBe(0);
    expect(editDistance('kuberntes', 'kubernetes', 2)).toBe(1);
    expect(editDistance('recat', 'react', 2)).toBe(2);
    expect(editDistance('react', 'tensorflow', 2)).toBe(3);
  });

  it('fixes a typo to the closest known word', () => {
    expect(correctQuery('kuberntes', vocabulary)).toBe('kubernetes');
    expect(correctQuery('tensorflw', vocabulary)).toBe('tensorflow');
    expect(correctQuery('javascrpt', vocabulary)).toBe('javascript');
  });

  it('leaves correct words alone and fixes only the wrong one', () => {
    expect(correctQuery('react frontnd', vocabulary)).toBe('react frontend');
    // "kube" is part of a known word, so there is nothing to correct.
    expect(correctQuery('kube', vocabulary)).toBeNull();
  });

  it('does not guess at short words or words nothing resembles', () => {
    expect(correctQuery('xy', vocabulary)).toBeNull();
    expect(correctQuery('zzzzzzzzzz', vocabulary)).toBeNull();
    expect(correctQuery('react zzzzzzzzzz', vocabulary)).toBeNull();
  });
});

describe('check my stars', () => {
  const all = [
    repo(1, 'a/react', { topics: ['react', 'frontend'], domains: ['web-product'], d7: 50 }),
    repo(2, 'b/vue', { topics: ['vue', 'frontend'], domains: ['web-product'] }),
    repo(3, 'c/ripgrep', {
      topics: ['rust', 'cli', 'search'],
      domains: ['developer-tools'],
      d7: 400,
    }),
    repo(4, 'd/fd', { topics: ['rust', 'cli'], domains: ['developer-tools'] }),
    repo(5, 'e/bat', { topics: ['rust', 'cli', 'terminal'], domains: ['developer-tools'] }),
    repo(6, 'f/notes', { topics: [] }),
    repo(7, 'g/old-cli', { topics: ['rust', 'cli'], archived: true }),
  ];

  it('summarises what a user has starred', () => {
    const summary = summariseStars([3, 4, 1, 999], all);
    expect(summary.starred.map((item) => item.name)).toEqual(['a/react', 'c/ripgrep', 'd/fd']);
    expect(summary.rising.map((item) => item.name)).toEqual(['c/ripgrep', 'a/react']);
    expect(summary.missing.map((item) => item.name)).toEqual([
      'b/vue',
      'e/bat',
      'f/notes',
      'g/old-cli',
    ]);
    expect(summary.domains).toEqual([
      ['developer-tools', 2],
      ['web-product', 1],
    ]);
  });

  it('recommends by topic overlap, skipping starred and archived repositories', () => {
    const starred = all.filter((item) => item.id === 3 || item.id === 4);
    expect(recommend(starred, all).map((item) => item.name)).toEqual(['e/bat']);
  });

  it('has nothing to recommend when the stars carry no topics', () => {
    expect(recommend([all[5]!], all)).toEqual([]);
    expect(summariseStars([], all).recommended).toEqual([]);
  });

  it('validates usernames', () => {
    expect(USERNAME_PATTERN.test('Joshi595')).toBe(true);
    expect(USERNAME_PATTERN.test('a-b')).toBe(true);
    expect(USERNAME_PATTERN.test('-bad')).toBe(false);
    expect(USERNAME_PATTERN.test('bad--name')).toBe(false);
    expect(USERNAME_PATTERN.test('has space')).toBe(false);
    expect(USERNAME_PATTERN.test('a/../b')).toBe(false);
  });

  const page = (count: number, start = 1) =>
    new Response(
      JSON.stringify(Array.from({ length: count }, (_, index) => ({ id: start + index }))),
    );

  it('reads pages until a short one', async () => {
    const urls: string[] = [];
    const responses = [page(100), page(30, 101)];
    const progress: number[] = [];
    const result = await fetchStarredIds('someone', (count) => progress.push(count), (async (
      url: string,
    ) => {
      urls.push(url);
      return responses.shift();
    }) as unknown as typeof fetch);
    expect(result).toMatchObject({ truncated: false });
    expect(result.ids).toHaveLength(130);
    expect(progress).toEqual([100, 130]);
    expect(urls[1]).toBe('https://api.github.com/users/someone/starred?per_page=100&page=2');
  });

  it('stops at the page cap and says so', async () => {
    let calls = 0;
    const result = await fetchStarredIds('someone', undefined, (async () => {
      calls += 1;
      return page(100);
    }) as unknown as typeof fetch);
    expect(calls).toBe(MAX_PAGES);
    expect(result.truncated).toBe(true);
  });

  it('reports a missing user, a rate limit and a network failure distinctly', async () => {
    const failing = (response: Response | Error) =>
      (async () => {
        if (response instanceof Error) throw response;
        return response;
      }) as unknown as typeof fetch;
    const kind = async (response: Response | Error) =>
      fetchStarredIds('someone', undefined, failing(response)).catch(
        (error: StarsFetchError) => error,
      );

    expect(await kind(new Response('', { status: 404 }))).toMatchObject({ kind: 'not-found' });
    expect(
      await kind(new Response('', { status: 403, headers: { 'x-ratelimit-reset': '1790000000' } })),
    ).toMatchObject({ kind: 'rate-limited', resetAt: 1_790_000_000_000 });
    expect(await kind(new TypeError('offline'))).toMatchObject({ kind: 'network' });
    expect(await kind(new Response('', { status: 500 }))).toMatchObject({ kind: 'network' });
  });
});

describe('weekly wording', () => {
  const report = {
    week: '2026-W40',
    start: '2026-09-28',
    end: '2026-10-04',
    from: '2026-09-17',
    to: '2026-10-02',
    final: false,
    repository_count: 5_605,
    total_gain: 1_234_567,
    gainers: [{ id: 1, name: 'a/b', stars: 44_600, gain: 9_700, growth: 0.27, places: 300 }],
    growth: [],
    climbers: [],
    entered: [{ id: 2, name: 'c/d', stars: 10_100 }],
    left: [],
  };

  it('describes a week', () => {
    expect(weekTitle(report)).toBe('Week 40, 2026');
    expect(weekRange(report)).toBe('Sep 28 to Oct 4, 2026');
    expect(weekBasis(report)).toBe('Compares the snapshots of Sep 17 and Oct 2, 2026.');
    expect(weekSummary(report)).toBe(
      '1,234,567 stars gained across 5,605 repositories; a/b gained the most (+9.7K); 1 repository joined the list.',
    );
    expect(weekPath(report.week)).toBe('/weekly/2026-w40/');
  });

  it('leaves out what did not happen', () => {
    expect(weekSummary({ ...report, gainers: [], entered: [] })).toBe(
      '1,234,567 stars gained across 5,605 repositories.',
    );
  });
});
