import { describe, expect, it } from 'vitest';
import { formatAge, formatCompact, formatDuration, formatSigned } from '../src/lib/format';
import { languageSlug } from '../src/lib/paths';
import {
  createList,
  decodeShare,
  DEFAULT_LIST_ID,
  defaultLists,
  deleteList,
  encodeShare,
  isSaved,
  renameList,
  sanitizeLists,
  toggleRepo,
  toMarkdown,
} from '../src/lib/shortlists';

describe('shortlists', () => {
  it('saves and unsaves a repository', () => {
    const saved = toggleRepo(defaultLists(), DEFAULT_LIST_ID, 42);
    expect(isSaved(saved, DEFAULT_LIST_ID, 42)).toBe(true);
    expect(isSaved(toggleRepo(saved, DEFAULT_LIST_ID, 42), DEFAULT_LIST_ID, 42)).toBe(false);
  });

  it('creates, renames and deletes lists', () => {
    const lists = createList(defaultLists(), '  Rust   tools ', [3, 3, 5], 'rust');
    expect(lists[1]).toEqual({ id: 'rust', name: 'Rust tools', repoIds: [3, 5] });
    expect(renameList(lists, 'rust', 'Systems')[1]?.name).toBe('Systems');
    expect(renameList(lists, 'rust', '   ')[1]?.name).toBe('Rust tools');
    expect(deleteList(lists, 'rust')).toHaveLength(1);
  });

  it('empties the default list instead of deleting it', () => {
    const lists = toggleRepo(defaultLists(), DEFAULT_LIST_ID, 1);
    expect(deleteList(lists, DEFAULT_LIST_ID)).toEqual(defaultLists());
  });

  it('repairs damaged storage', () => {
    expect(sanitizeLists('nonsense')).toEqual(defaultLists());
    expect(
      sanitizeLists([
        { id: 'a', name: 'A', repoIds: [1, 1, 'x', -4, 2.5, 7] },
        { id: 'a', name: 'Duplicate id', repoIds: [] },
        { name: 'No id' },
        null,
      ]),
    ).toEqual([...defaultLists(), { id: 'a', name: 'A', repoIds: [1, 7] }]);
  });

  it('round-trips a list through a share link', () => {
    const list = { name: 'AI & data: my picks/2026', repoIds: [132750724, 21737465, 7] };
    const encoded = encodeShare(list);
    expect(encoded).toMatch(/^[A-Za-z0-9%._~!'()*-]+$/);
    expect(decodeShare(encoded)).toEqual(list);
    // Survives being carried in a query string.
    const query = new URLSearchParams({ s: encoded }).toString();
    expect(decodeShare(new URLSearchParams(query).get('s') ?? '')).toEqual(list);
  });

  it('rejects malformed share links', () => {
    expect(decodeShare('')).toBeNull();
    expect(decodeShare('no-separator')).toBeNull();
    expect(decodeShare('name~')).toBeNull();
    expect(decodeShare('%E0%A4%A~1')).toBeNull();
    expect(decodeShare('name~1.<script>.2')).toEqual({ name: 'name', repoIds: [1, 2] });
  });

  it('exports Markdown', () => {
    const markdown = toMarkdown('Picks', [
      { name: 'a/b', url: 'https://github.com/a/b', description: 'Does\n things', stars: 12_345 },
      { name: 'c/d', url: 'https://github.com/c/d', description: '', stars: 10_000 },
    ]);
    expect(markdown).toBe(
      '# Picks\n\n- [a/b](https://github.com/a/b) (★ 12,345): Does things\n- [c/d](https://github.com/c/d) (★ 10,000)\n',
    );
  });
});

describe('formatting', () => {
  const now = Date.parse('2026-09-17T12:00:00Z');
  const daysAgo = (days: number) => now - days * 86_400_000;

  it('formats ages relative to the snapshot', () => {
    expect(formatAge(daysAgo(0), now)).toBe('today');
    expect(formatAge(daysAgo(12), now)).toBe('12d ago');
    expect(formatAge(daysAgo(95), now)).toBe('3mo ago');
    expect(formatAge(daysAgo(800), now)).toBe('2y ago');
    expect(formatAge(null, now)).toBe('unknown');
    expect(formatDuration(daysAgo(400), now)).toBe('1y');
  });

  it('formats numbers', () => {
    expect(formatCompact(12_345)).toBe('12.3K');
    expect(formatSigned(1_250)).toBe('+1.3K');
    expect(formatSigned(-40)).toBe('-40');
    expect(formatSigned(0)).toBe('0');
  });

  it('makes URL-safe language slugs', () => {
    expect(languageSlug('C++')).toBe('cpp');
    expect(languageSlug('C#')).toBe('c-sharp');
    expect(languageSlug('Jupyter Notebook')).toBe('jupyter-notebook');
    expect(languageSlug('Vim Script')).toBe(languageSlug('Vim script'));
  });
});
