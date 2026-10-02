import { describe, expect, it } from 'vitest';
import { decodeSiteIndex, encodeDetailBuckets, encodeSiteIndex, SnapshotSchema } from '@agr/schema';
import {
  escapeCell,
  renderDomainLists,
  renderRepoTable,
  replaceSection,
  STATS_END_MARKER,
  STATS_START_MARKER,
  TOP_END_MARKER,
  TOP_START_MARKER,
  updateReadme,
} from '../src/export/markdown';
import { assertPlausibleCount, buildSnapshot } from '../src/export/snapshot';
import { shiftDate } from '../src/history/momentum';
import { createHistoryEntry } from '../src/history/store';
import { isoWeekOf } from '../src/history/weekly';
import { collections, loadFixture, taxonomy } from './helpers';

const raw = loadFixture();
const today = raw.generated_at.slice(0, 10);
const { snapshot, historyEntry, warnings } = buildSnapshot({
  raw,
  taxonomy,
  collections,
  history: [],
});

describe('buildSnapshot', () => {
  it('produces a schema-valid snapshot ranked by stars', () => {
    expect(SnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(snapshot.repository_count).toBe(raw.repositories.length);
    expect(snapshot.repositories.map((repo) => repo.rank)).toEqual(
      snapshot.repositories.map((_, index) => index + 1),
    );
    const stars = snapshot.repositories.map((repo) => repo.stars);
    expect(stars).toEqual([...stars].sort((a, b) => b - a));
  });

  it('counts every repository in at least one domain', () => {
    const known = new Set(snapshot.domains.map((domain) => domain.id));
    expect(
      snapshot.repositories.every((repo) => repo.domains.every((domain) => known.has(domain))),
    ).toBe(true);
    const primaryTotal = snapshot.domains.reduce((sum, domain) => sum + domain.count, 0);
    expect(primaryTotal).toBeGreaterThanOrEqual(snapshot.repository_count);
  });

  it('resolves every curated collection entry in the fixture', () => {
    expect(warnings).toEqual([]);
    expect(snapshot.collections).toHaveLength(collections.length);
    const ids = new Set(snapshot.repositories.map((repo) => repo.id));
    for (const collection of snapshot.collections) {
      expect(collection.entries.length).toBeGreaterThan(0);
      expect(collection.entries.every((entry) => ids.has(entry.id))).toBe(true);
    }
  });

  it('warns about, and drops, a collection entry that is no longer listed', () => {
    const stale = [{ ...collections[0]!, repositories: [{ name: 'gone/away', note: '' }] }];
    const result = buildSnapshot({ raw, taxonomy, collections: stale, history: [] });
    expect(result.warnings).toHaveLength(1);
    expect(result.snapshot.collections[0]?.entries).toEqual([]);
  });

  it('records the day and derives momentum from earlier history', () => {
    expect(historyEntry.date).toBe(raw.generated_at.slice(0, 10));
    expect(historyEntry.count).toBe(snapshot.repository_count);
    expect(snapshot.history.days).toBe(1);

    expect(snapshot.history.samples).toEqual([today]);
    expect(snapshot.weekly).toEqual([]);

    const first = snapshot.repositories[0]!;
    const weekAgo = createHistoryEntry(shiftDate(today, -7), [
      { id: first.id, stars: first.stars - 700 },
    ]);
    const later = buildSnapshot({ raw, taxonomy, collections, history: [weekAgo] });
    expect(later.snapshot.history).toEqual({
      days: 2,
      first: weekAgo.date,
      last: today,
      samples: [weekAgo.date, today],
    });
    expect(later.snapshot.repositories[0]?.momentum.d7).toBe(700);
    expect(later.snapshot.repositories[1]?.momentum).toMatchObject({ d7: null, is_new: true });
  });

  it('builds the running week report and remembers repository names', () => {
    const first = snapshot.repositories[0]!;
    const baseline = createHistoryEntry(shiftDate(isoWeekOf(today).start, -1), [
      { id: first.id, stars: first.stars - 500 },
      { id: 999_999_999, stars: 12_000 },
    ]);
    const result = buildSnapshot({
      raw,
      taxonomy,
      collections,
      history: [baseline],
      names: { '999999999': 'gone/away' },
    });

    const report = result.snapshot.weekly[0]!;
    expect(report).toMatchObject({ week: isoWeekOf(today).week, final: false, to: today });
    expect(report.gainers[0]).toMatchObject({ name: first.name, gain: 500 });
    expect(report.left).toEqual([{ id: 999_999_999, name: 'gone/away', stars: 12_000 }]);
    expect(report.entered).toHaveLength(snapshot.repository_count - 1);
    // A week still in progress is recomputed tomorrow, so it is not stored.
    expect(result.weeklyToStore).toEqual([]);
    expect(result.names[String(first.id)]).toBe(first.name);
    expect(result.names['999999999']).toBe('gone/away');
  });

  it('carries health figures through, marking releases as unchecked without a lookup', () => {
    const [plain, enriched] = raw.repositories;
    const result = buildSnapshot({
      raw: {
        ...raw,
        repositories: [
          { ...plain!, open_issues_count: 42, health: undefined },
          {
            ...enriched!,
            open_issues_count: 30,
            health: {
              latest_release_at: '2026-09-01T00:00:00Z',
              latest_release_tag: 'v2.0.0',
              open_issues: 20,
              open_pull_requests: 10,
            },
          },
        ],
      },
      taxonomy,
      collections: [],
      history: [],
    }).snapshot;
    const byId = new Map(result.repositories.map((repo) => [repo.id, repo.health]));

    expect(byId.get(plain!.id)).toEqual({
      open_total: 42,
      open_issues: null,
      open_pull_requests: null,
      latest_release_at: null,
      latest_release_tag: null,
      releases_checked: false,
    });
    expect(byId.get(enriched!.id)).toMatchObject({
      open_issues: 20,
      open_pull_requests: 10,
      latest_release_tag: 'v2.0.0',
      releases_checked: true,
    });
  });

  it('drops repositories below the threshold', () => {
    const lowered = { ...raw, minimum_stars: 200_000 };
    const result = buildSnapshot({ raw: lowered, taxonomy, collections: [], history: [] }).snapshot;
    expect(result.repositories.every((repo) => repo.stars >= 200_000)).toBe(true);
    expect(result.repository_count).toBeLessThan(raw.repositories.length);
  });
});

describe('assertPlausibleCount', () => {
  const previous = createHistoryEntry(
    '2026-09-16',
    Array.from({ length: 1_000 }, (_, index) => ({ id: index + 1, stars: 10_000 })),
  );

  it('accepts normal day-to-day movement', () => {
    expect(() => assertPlausibleCount(960, previous)).not.toThrow();
    expect(() => assertPlausibleCount(1_200, previous)).not.toThrow();
    expect(() => assertPlausibleCount(10, undefined)).not.toThrow();
  });

  it('refuses a collapse in the repository count', () => {
    expect(() => assertPlausibleCount(940, previous)).toThrow(/Refusing to publish/);
  });
});

describe('site index', () => {
  const index = encodeSiteIndex(snapshot);
  const decoded = decodeSiteIndex(index);

  it('round-trips the fields the explorer uses', () => {
    expect(decoded).toHaveLength(snapshot.repository_count);
    snapshot.repositories.forEach((repo, position) => {
      const row = decoded[position]!;
      expect(row).toMatchObject({
        id: repo.id,
        rank: repo.rank,
        name: repo.name,
        owner: repo.owner,
        url: repo.url,
        description: repo.description ?? '',
        stars: repo.stars,
        forks: repo.forks,
        language: repo.language,
        domains: repo.domains,
        activity: repo.activity,
        maturity: repo.maturity,
        hasLicense: repo.license !== null,
        hasHomepage: repo.homepage !== null,
        archived: repo.archived,
      });
      expect(row.pushedAt === null).toBe(repo.pushed_at === null);
    });
  });

  it('keeps only topics shared by several repositories', () => {
    const shared = new Set(index.topics);
    for (const [position, repo] of snapshot.repositories.entries()) {
      expect(decoded[position]?.topics).toEqual(repo.topics.filter((topic) => shared.has(topic)));
    }
  });

  it('is much smaller than the snapshot', () => {
    expect(JSON.stringify(index).length).toBeLessThan(JSON.stringify(snapshot).length * 0.6);
  });

  it('puts every repository in exactly one detail bucket', () => {
    const buckets = encodeDetailBuckets(snapshot);
    expect(buckets).toHaveLength(64);
    expect(buckets.reduce((sum, bucket) => sum + Object.keys(bucket).length, 0)).toBe(
      snapshot.repository_count,
    );
    const first = snapshot.repositories[0]!;
    expect(buckets[first.id % 64]?.[String(first.id)]).toMatchObject({
      topics: first.topics,
      health: first.health,
    });
  });

  it('rejects an index from another version', () => {
    expect(() => decodeSiteIndex({ ...index, v: 99 as typeof index.v })).toThrow(/Unsupported/);
  });
});

describe('markdown export', () => {
  it('escapes table cells', () => {
    expect(escapeCell('a | b\nc')).toBe('a \\| b c');
    expect(escapeCell(null)).toBe('');
  });

  it('renders a table row per repository', () => {
    const table = renderRepoTable(snapshot.repositories.slice(0, 3));
    expect(table.split('\n')).toHaveLength(5);
    expect(table).toContain(
      `[${snapshot.repositories[0]!.name}](${snapshot.repositories[0]!.url})`,
    );
  });

  it('replaces only the text between markers', () => {
    expect(replaceSection('a <!--s-->old<!--e--> z', '<!--s-->', '<!--e-->', 'new')).toBe(
      'a <!--s-->\nnew\n<!--e--> z',
    );
    expect(() => replaceSection('no markers', '<!--s-->', '<!--e-->', 'x')).toThrow(/markers/);
  });

  it('updates the README stats and top list, and is stable when run twice', () => {
    const readme = `# Title\n\n${STATS_START_MARKER}\n${STATS_END_MARKER}\n\n${TOP_START_MARKER}\n${TOP_END_MARKER}\n\nFooter\n`;
    const once = updateReadme(readme, snapshot);
    expect(once).toContain(`as of **${today}**`);
    expect(once).toContain('| 100 |');
    expect(once).not.toContain('| 101 |');
    expect(once.endsWith('Footer\n')).toBe(true);
    expect(updateReadme(once, snapshot)).toBe(once);
  });

  it('writes one list per domain plus an index', () => {
    const lists = renderDomainLists(snapshot);
    expect([...lists.keys()].sort()).toEqual(
      [...snapshot.domains.map((domain) => `${domain.id}.md`), 'README.md'].sort(),
    );
    expect(lists.get('README.md')).toContain('(ai-data.md)');
  });
});
