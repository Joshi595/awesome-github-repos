import { describe, expect, it } from 'vitest';
import type { IndexRepo, ResolvedCollection } from '@agr/schema';
import {
  activeChips,
  DEFAULT_FILTERS,
  filterRepos,
  isUnfiltered,
  removeChip,
  toggle,
  type ExplorerRepo,
  type Filters,
} from '../src/lib/filter';
import { scoreMatch, tokenize, toSearchDoc } from '../src/lib/search';
import { parseFilters, serializeFilters } from '../src/lib/url-state';

const DAY = 86_400_000;

function repo(rank: number, name: string, overrides: Partial<IndexRepo> = {}): ExplorerRepo {
  const [owner = '', short = ''] = name.split('/');
  const base: IndexRepo = {
    id: rank,
    rank,
    name,
    owner,
    repo: short,
    url: `https://github.com/${name}`,
    description: '',
    stars: 200_000 - rank * 10_000,
    forks: rank * 100,
    language: null,
    topics: [],
    domains: ['other'],
    pushedAt: 20_000 * DAY,
    createdAt: 15_000 * DAY,
    hasLicense: true,
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
  return { ...base, doc: toSearchDoc(base) };
}

const repos = [
  repo(1, 'facebook/react', {
    description: 'The library for web and native user interfaces.',
    language: 'JavaScript',
    topics: ['react', 'frontend', 'ui'],
    domains: ['web-product'],
    d7: 120,
  }),
  repo(2, 'tensorflow/tensorflow', {
    description: 'An Open Source Machine Learning Framework for Everyone',
    language: 'C++',
    topics: ['machine-learning', 'deep-learning'],
    domains: ['ai-data'],
    d7: 900,
    pushedAt: 20_010 * DAY,
  }),
  repo(3, 'vercel/next.js', {
    description: 'The React Framework',
    language: 'JavaScript',
    topics: ['react', 'nextjs', 'ssr'],
    domains: ['web-product', 'developer-tools'],
    activity: 'maintained',
  }),
  repo(4, 'someone/reactive-notes', {
    description: 'Notes app',
    language: 'TypeScript',
    domains: ['other'],
    maturity: 'emerging',
    isNew: true,
    createdAt: 20_300 * DAY,
    activity: 'quiet',
  }),
  repo(5, 'acme/toolkit', {
    description: 'Helpers for react projects',
    language: null,
    maturity: 'unknown',
  }),
];
const collections: ResolvedCollection[] = [
  {
    id: 'frontend',
    title: 'Frontend',
    audience: 'Builders',
    description: '',
    last_reviewed: '2026-09-17',
    entries: [
      { id: 1, note: '' },
      { id: 3, note: '' },
    ],
  },
];

const names = (filters: Partial<Filters>) =>
  filterRepos(repos, { ...DEFAULT_FILTERS, ...filters }, collections).map((item) => item.name);

describe('search', () => {
  it('tokenizes into distinct lower-cased words', () => {
    expect(tokenize('  React  UI react ')).toEqual(['react', 'ui']);
    expect(tokenize('   ')).toEqual([]);
  });

  it('ranks an exact name above a partial name, a topic and a description', () => {
    const score = (index: number) => scoreMatch(repos[index]!.doc, ['react']);
    expect(score(0)).toBeGreaterThan(score(3)); // exact repo name > name contains
    expect(score(3)).toBeGreaterThan(score(2)); // name contains > topic
    expect(score(2)).toBeGreaterThan(score(4)); // topic > description only
    expect(score(1)).toBe(0);
  });

  it('requires every word to match somewhere', () => {
    expect(scoreMatch(repos[2]!.doc, ['react', 'framework'])).toBeGreaterThan(0);
    expect(scoreMatch(repos[2]!.doc, ['react', 'python'])).toBe(0);
  });

  it('matches the language', () => {
    expect(scoreMatch(repos[3]!.doc, ['typescript'])).toBeGreaterThan(0);
  });
});

describe('filterRepos', () => {
  it('returns everything in rank order by default', () => {
    expect(names({})).toEqual(repos.map((item) => item.name));
  });

  it('orders search results by relevance, then stars', () => {
    expect(names({ q: 'react' })).toEqual([
      'facebook/react',
      'someone/reactive-notes',
      'vercel/next.js',
      'acme/toolkit',
    ]);
  });

  it('keeps an explicit sort when searching', () => {
    expect(names({ q: 'react', sort: 'forks' })[0]).toBe('acme/toolkit');
  });

  it('matches any selected language and any selected domain', () => {
    expect(names({ languages: ['C++', 'TypeScript'] })).toEqual([
      'tensorflow/tensorflow',
      'someone/reactive-notes',
    ]);
    expect(names({ domains: ['ai-data', 'developer-tools'] })).toEqual([
      'tensorflow/tensorflow',
      'vercel/next.js',
    ]);
  });

  it('requires all selected topics', () => {
    expect(names({ topics: ['react'] })).toEqual(['facebook/react', 'vercel/next.js']);
    expect(names({ topics: ['react', 'ssr'] })).toEqual(['vercel/next.js']);
  });

  it('filters by star floor, activity, age and new entrants', () => {
    expect(names({ minStars: 175_000 })).toEqual(['facebook/react', 'tensorflow/tensorflow']);
    expect(names({ activity: ['maintained', 'quiet'] })).toEqual([
      'vercel/next.js',
      'someone/reactive-notes',
    ]);
    expect(names({ age: ['emerging'] })).toEqual(['someone/reactive-notes']);
    expect(names({ age: ['established'] })).toEqual([
      'facebook/react',
      'tensorflow/tensorflow',
      'vercel/next.js',
    ]);
    expect(names({ age: ['emerging', 'established'] })).toHaveLength(5);
    expect(names({ onlyNew: true })).toEqual(['someone/reactive-notes']);
  });

  it('treats a collection as one more filter that combines with the rest', () => {
    expect(names({ collection: 'frontend' })).toEqual(['facebook/react', 'vercel/next.js']);
    expect(names({ collection: 'frontend', q: 'framework' })).toEqual(['vercel/next.js']);
    expect(names({ collection: 'does-not-exist' })).toEqual([]);
  });

  it('sorts by each key with missing values last', () => {
    expect(names({ sort: 'gain7' }).slice(0, 3)).toEqual([
      'tensorflow/tensorflow',
      'facebook/react',
      'vercel/next.js',
    ]);
    expect(names({ sort: 'forks' })[0]).toBe('acme/toolkit');
    expect(names({ sort: 'pushed' })[0]).toBe('tensorflow/tensorflow');
    expect(names({ sort: 'created' })[0]).toBe('someone/reactive-notes');
  });

  it('does not mutate its input', () => {
    const before = repos.map((item) => item.name);
    names({ sort: 'forks' });
    expect(repos.map((item) => item.name)).toEqual(before);
  });
});

describe('chips', () => {
  const filters: Filters = {
    ...DEFAULT_FILTERS,
    q: ' react ',
    domains: ['web-product'],
    topics: ['react', 'ssr'],
    activity: ['active'],
    minStars: 50_000,
    onlyNew: true,
  };

  it('lists every active filter once', () => {
    expect(activeChips(DEFAULT_FILTERS)).toEqual([]);
    expect(activeChips(filters).map((chip) => `${chip.key}:${chip.value}`)).toEqual([
      'q:react',
      'domain:web-product',
      'topic:react',
      'topic:ssr',
      'activity:active',
      'stars:50000',
      'new:new',
    ]);
  });

  it('removing every chip returns to the unfiltered state', () => {
    const cleared = activeChips(filters).reduce(removeChip, filters);
    expect(isUnfiltered(cleared)).toBe(true);
    expect(isUnfiltered(filters)).toBe(false);
  });

  it('removes one topic and leaves the other', () => {
    expect(removeChip(filters, { key: 'topic', value: 'react' }).topics).toEqual(['ssr']);
  });

  it('toggles list membership', () => {
    expect(toggle(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggle(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('url state', () => {
  it('writes nothing for the default view', () => {
    expect(serializeFilters(DEFAULT_FILTERS).toString()).toBe('');
  });

  it('round-trips a full filter state', () => {
    const filters: Filters = {
      q: 'vector db',
      domains: ['ai-data', 'data-databases'],
      languages: ['C++', 'Jupyter Notebook'],
      topics: ['rag'],
      activity: ['active', 'maintained'],
      age: ['emerging'],
      minStars: 25_000,
      collection: 'ai-builder-toolkit',
      onlyNew: true,
      sort: 'gain7',
    };
    const query = serializeFilters(filters).toString();
    expect(parseFilters(new URLSearchParams(query))).toEqual(filters);
  });

  it('ignores values it does not recognise', () => {
    const parsed = parseFilters(
      new URLSearchParams(
        'sort=bogus&activity=sleepy&activity=active&stars=12&age=old&new=yes&topic=&topic=a&topic=a',
      ),
    );
    expect(parsed).toEqual({ ...DEFAULT_FILTERS, activity: ['active'], topics: ['a'] });
  });
});
