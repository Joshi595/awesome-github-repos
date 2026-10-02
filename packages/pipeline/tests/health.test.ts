import { describe, expect, it } from 'vitest';
import { addHealth } from '../src/github/health';
import { rawRepo } from './helpers';

interface Call {
  ids: string[];
  authorization: string;
}

/** A fake GraphQL endpoint: answers from `known`, or with whatever `respond` returns. */
function setup(respond?: (ids: string[], call: number) => Response | Error) {
  const calls: Call[] = [];
  const logs: string[] = [];
  const fetchImpl = (async (
    _url: string,
    init: { body: string; headers: Record<string, string> },
  ) => {
    const ids = (JSON.parse(init.body) as { variables: { ids: string[] } }).variables.ids;
    calls.push({ ids, authorization: init.headers.Authorization ?? '' });
    const custom = respond?.(ids, calls.length);
    if (custom instanceof Error) throw custom;
    if (custom) return custom;
    const nodes = ids.map((id) => ({
      id,
      latestRelease:
        id === 'N1' ? { publishedAt: '2026-09-01T00:00:00Z', tagName: 'v1.2.0' } : null,
      issues: { totalCount: 7 },
      pullRequests: { totalCount: 3 },
    }));
    return new Response(JSON.stringify({ data: { nodes } }));
  }) as unknown as typeof fetch;
  const options = {
    token: 'secret',
    fetchImpl,
    sleep: async () => {},
    log: (line: string) => logs.push(line),
  };
  return { calls, logs, options };
}

const repos = [rawRepo(1, 50_000, { node_id: 'N1' }), rawRepo(2, 40_000, { node_id: 'N2' })];

describe('addHealth', () => {
  it('adds release and open issue figures', async () => {
    const { calls, options } = setup();
    const result = await addHealth(repos, options);

    expect(calls).toEqual([{ ids: ['N1', 'N2'], authorization: 'Bearer secret' }]);
    expect(result[0]?.health).toEqual({
      latest_release_at: '2026-09-01T00:00:00Z',
      latest_release_tag: 'v1.2.0',
      open_issues: 7,
      open_pull_requests: 3,
    });
    expect(result[1]?.health).toMatchObject({ latest_release_at: null, latest_release_tag: null });
  });

  it('asks in batches of 50', async () => {
    const many = Array.from({ length: 120 }, (_, index) =>
      rawRepo(index + 1, 20_000, { node_id: `N${index + 1}` }),
    );
    const { calls, options } = setup();
    const result = await addHealth(many, options);

    expect(calls.map((call) => call.ids.length)).toEqual([50, 50, 20]);
    expect(result.every((repo) => repo.health)).toBe(true);
  });

  it('skips repositories without a node id, and ones GitHub no longer returns', async () => {
    const { options } = setup(
      () =>
        new Response(JSON.stringify({ data: { nodes: [null] }, errors: [{ type: 'NOT_FOUND' }] })),
    );
    const result = await addHealth(
      [rawRepo(1, 50_000, { node_id: 'N1' }), rawRepo(2, 40_000)],
      options,
    );
    expect(result.map((repo) => repo.health)).toEqual([undefined, undefined]);
  });

  it('retries a failing batch', async () => {
    const { calls, options } = setup((_ids, call) =>
      call < 3 ? new Response('', { status: 502 }) : undefined!,
    );
    const result = await addHealth(repos, options);
    expect(calls).toHaveLength(3);
    expect(result[0]?.health?.open_issues).toBe(7);
  });

  it('gives up on a batch without failing the fetch', async () => {
    const { logs, options } = setup(() => new TypeError('fetch failed'));
    const result = await addHealth(repos, options);

    expect(result).toEqual(repos);
    expect(logs.join('\n')).toMatch(/health lookup failed for 2 repositories/);
    expect(logs.join('\n')).toMatch(/1 batches failed/);
  });
});
