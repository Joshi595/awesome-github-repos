import { describe, expect, it } from 'vitest';
import { GitHubClient, GitHubError } from '../src/github/client';

const OK_BODY = { total_count: 1, incomplete_results: false, items: [{ id: 1 }] };

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

/** A client wired to scripted responses, a virtual clock and recorded sleeps. */
function setup(
  responses: (Response | Error)[],
  options: { token?: string; minIntervalMs?: number } = {},
) {
  let clock = 0;
  const sleeps: number[] = [];
  const requests: { url: string; headers: Record<string, string> }[] = [];
  const client = new GitHubClient({
    token: options.token,
    minIntervalMs: options.minIntervalMs ?? 0,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    fetchImpl: (async (url: string, init: { headers: Record<string, string> }) => {
      requests.push({ url, headers: init.headers });
      const next = responses.shift();
      if (next === undefined) throw new Error('No scripted response left.');
      if (next instanceof Error) throw next;
      return next;
    }) as unknown as typeof fetch,
  });
  return { client, sleeps, requests };
}

describe('GitHubClient', () => {
  it('sends the query and the token', async () => {
    const { client, requests } = setup([json(OK_BODY)], { token: 'secret' });
    const result = await client.searchRepositories('stars:>=10000', 2, 100);

    expect(result.total_count).toBe(1);
    expect(requests[0]?.url).toContain('q=stars%3A%3E%3D10000');
    expect(requests[0]?.url).toContain('page=2');
    expect(requests[0]?.headers.Authorization).toBe('Bearer secret');
  });

  it('works without a token', async () => {
    const { client, requests } = setup([json(OK_BODY)]);
    await client.searchRepositories('stars:>=1');
    expect(client.authenticated).toBe(false);
    expect(requests[0]?.headers.Authorization).toBeUndefined();
  });

  it('retries server errors with exponential backoff', async () => {
    const { client, sleeps } = setup([json({}, 503), json({}, 502), json(OK_BODY)]);
    await expect(client.searchRepositories('q')).resolves.toMatchObject({ total_count: 1 });
    expect(sleeps).toEqual([1_000, 2_000]);
  });

  it('waits as long as Retry-After asks', async () => {
    const { client, sleeps } = setup([json({}, 429, { 'retry-after': '17' }), json(OK_BODY)]);
    await client.searchRepositories('q');
    expect(sleeps).toEqual([17_000]);
  });

  it('waits for the rate limit to reset', async () => {
    const reset = { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '30' };
    const { client, sleeps } = setup([json({}, 403, reset), json(OK_BODY)]);
    await client.searchRepositories('q');
    expect(sleeps).toEqual([31_000]);
  });

  it('retries network failures and incomplete results', async () => {
    const incomplete = { ...OK_BODY, incomplete_results: true };
    const { client, sleeps } = setup([
      new TypeError('fetch failed'),
      json(incomplete),
      json(OK_BODY),
    ]);
    await expect(client.searchRepositories('q')).resolves.toMatchObject({
      incomplete_results: false,
    });
    expect(sleeps).toHaveLength(2);
  });

  it('does not retry a request GitHub rejects outright', async () => {
    const { client, sleeps } = setup([json({ message: 'Validation Failed' }, 422)]);
    await expect(client.searchRepositories('q')).rejects.toThrow(GitHubError);
    expect(sleeps).toEqual([]);
  });

  it('gives up after the configured number of attempts', async () => {
    const { client } = setup(Array.from({ length: 5 }, () => json({}, 500)));
    await expect(client.searchRepositories('q')).rejects.toThrow(/after 5 attempts/);
  });

  it('spaces requests to respect the search rate limit', async () => {
    const { client, sleeps } = setup([json(OK_BODY), json(OK_BODY)], { minIntervalMs: 2_000 });
    await client.searchRepositories('q');
    await client.searchRepositories('q');
    expect(sleeps).toEqual([2_000]);
  });
});
