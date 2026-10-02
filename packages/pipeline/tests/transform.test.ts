import { describe, expect, it } from 'vitest';
import { createClassifier, type ClassifierInput } from '../src/transform/classify';
import { normalizeRepo, normalizeTopics } from '../src/transform/normalize';
import { activityStatus, maturityStatus } from '../src/transform/signals';
import { computeSimilar } from '../src/transform/similar';
import { rawRepo, taxonomy } from './helpers';

const classify = createClassifier(taxonomy);
const repo = (overrides: Partial<ClassifierInput>): ClassifierInput => ({
  name: 'owner/project',
  description: null,
  language: null,
  topics: [],
  ...overrides,
});

describe('classifier', () => {
  it('never assigns a domain on language alone', () => {
    expect(classify(repo({ language: 'Python' }))).toEqual(['other']);
    expect(classify(repo({ language: 'Java', description: 'A small utility library.' }))).toEqual([
      'other',
    ]);
  });

  it('files a Python web framework under web, not AI', () => {
    const domains = classify(
      repo({
        name: 'django/django',
        description: 'The Web framework for perfectionists with deadlines.',
        language: 'Python',
        topics: ['django', 'framework', 'python', 'web'],
      }),
    );
    expect(domains[0]).toBe('web-product');
    expect(domains).not.toContain('ai-data');
  });

  it('uses topics as the strongest signal', () => {
    const domains = classify(
      repo({
        language: 'TypeScript',
        topics: ['llm', 'machine-learning'],
        description: 'Run models.',
      }),
    );
    expect(domains[0]).toBe('ai-data');
  });

  it('matches keywords as whole words only', () => {
    // "ai" inside "maintained" and "git" inside "digital" must not count.
    expect(classify(repo({ description: 'A maintained digital toolkit.' }))).toEqual(['other']);
    expect(classify(repo({ description: 'An AI assistant for your notes.' }))[0]).toBe('ai-data');
  });

  it('reads the repository name as evidence', () => {
    expect(classify(repo({ name: 'someone/awesome-things' }))[0]).toBe('learning');
  });

  it('adds a secondary domain only when it has strong evidence of its own', () => {
    const domains = classify(
      repo({ topics: ['kubernetes', 'docker', 'security', 'vulnerability'] }),
    );
    expect(domains).toEqual(['systems-infrastructure', 'security']);
    expect(
      classify(repo({ topics: ['kubernetes', 'docker', 'devops'], language: 'Vim Script' })),
    ).toEqual(['systems-infrastructure']);
  });

  it('caps the number of domains', () => {
    const topics = ['llm', 'react', 'android', 'database', 'docker', 'cli'];
    expect(classify(repo({ topics })).length).toBeLessThanOrEqual(3);
  });
});

describe('signals', () => {
  const now = new Date('2026-09-17T12:00:00Z');

  it('grades activity by days since the last push', () => {
    expect(activityStatus('2026-09-01T00:00:00Z', now)).toBe('active');
    expect(activityStatus('2026-08-18T00:00:00Z', now)).toBe('active'); // 30 days
    expect(activityStatus('2026-08-17T00:00:00Z', now)).toBe('maintained'); // 31 days
    expect(activityStatus('2026-01-01T00:00:00Z', now)).toBe('quiet');
    expect(activityStatus(null, now)).toBe('unknown');
    expect(activityStatus('not a date', now)).toBe('unknown');
  });

  it('grades maturity by age and activity', () => {
    expect(maturityStatus('2026-01-01T00:00:00Z', 'active', now)).toBe('emerging');
    expect(maturityStatus('2020-01-01T00:00:00Z', 'maintained', now)).toBe('established');
    expect(maturityStatus('2020-01-01T00:00:00Z', 'quiet', now)).toBe('established-quiet');
    expect(maturityStatus(undefined, 'active', now)).toBe('unknown');
  });
});

describe('normalize', () => {
  it('cleans topics', () => {
    expect(normalizeTopics([' React', 'react', 'API', '', 'cli'])).toEqual(['api', 'cli', 'react']);
    expect(normalizeTopics(null)).toEqual([]);
  });

  it('maps a raw repository and blanks out empty strings', () => {
    const raw = rawRepo(7, 12_345, {
      full_name: 'acme/tool',
      html_url: 'https://github.com/acme/tool',
      description: '  ',
      homepage: '',
      license: { name: 'MIT License' },
      topics: ['CLI'],
      owner: { login: 'acme', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' },
    });
    const normalized = normalizeRepo(raw, classify, new Date('2026-09-17T00:00:00Z'));

    expect(normalized).toMatchObject({
      id: 7,
      name: 'acme/tool',
      owner: 'acme',
      stars: 12_345,
      description: null,
      homepage: null,
      license: 'MIT License',
      topics: ['cli'],
      domains: ['developer-tools'],
      activity: 'active',
      maturity: 'established',
      archived: false,
    });
  });
});

describe('computeSimilar', () => {
  const repos = [
    { id: 1, language: 'Go', topics: ['raft', 'consensus', 'go'] },
    { id: 2, language: 'Go', topics: ['raft', 'consensus', 'database', 'go'] },
    { id: 3, language: 'Rust', topics: ['raft'] },
    { id: 4, language: 'Go', topics: ['go', 'cli'] },
    { id: 5, language: 'Python', topics: ['machine-learning'] },
    { id: 6, language: null, topics: [] },
    { id: 7, language: 'Go', topics: ['go', 'web'] },
    { id: 8, language: 'Go', topics: ['go', 'orm'] },
  ];
  const similar = computeSimilar(repos);

  it('ranks the closest topic match first and excludes the repository itself', () => {
    expect(similar.get(1)?.[0]).toBe(2);
    expect(similar.get(1)).not.toContain(1);
  });

  it('weights rare topics above common ones', () => {
    // Repo 3 shares only the rarer "raft" and is a different language; repo 4 shares only
    // the common "go", which is too generic to count as similar despite the language match.
    const forOne = similar.get(1) ?? [];
    expect(forOne).toContain(3);
    expect(forOne).not.toContain(4);
  });

  it('returns nothing for repositories with no shared topics', () => {
    expect(similar.get(5)).toEqual([]);
    expect(similar.get(6)).toEqual([]);
  });

  it('respects the limit', () => {
    const many = Array.from({ length: 20 }, (_, index) => ({
      id: index + 1,
      language: null,
      topics: ['x', `t${index % 2}`],
    }));
    expect(computeSimilar(many, 4).get(1)).toHaveLength(4);
  });
});
