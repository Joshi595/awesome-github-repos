import type { RawHealth, RawRepo } from '@agr/schema';

const GRAPHQL_URL = 'https://api.github.com/graphql';
/** Small batches keep each query well inside GitHub's time limit. */
const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 4;
const REQUEST_TIMEOUT_MS = 30_000;
/** The longest we will wait when GitHub asks us to back off, so one batch cannot stall the job. */
const MAX_BACKOFF_MS = 90_000;

/** A failed request, with how long GitHub asked us to wait before retrying (if it said). */
class RequestFailure extends Error {
  constructor(
    message: string,
    readonly retryAfterMs: number | null,
  ) {
    super(message);
  }
}

const QUERY = `
  query($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Repository {
        id
        latestRelease { publishedAt tagName }
        issues(states: OPEN) { totalCount }
        pullRequests(states: OPEN) { totalCount }
      }
    }
  }
`;

interface HealthNode {
  id: string;
  latestRelease: { publishedAt: string | null; tagName: string | null } | null;
  issues: { totalCount: number };
  pullRequests: { totalCount: number };
}

export interface HealthOptions {
  token: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
}

async function queryBatch(ids: string[], options: Required<HealthOptions>): Promise<HealthNode[]> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await options.fetchImpl(GRAPHQL_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'awesome-github-repos',
        },
        body: JSON.stringify({ query: QUERY, variables: { ids } }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        const retryAfter = Number(response.headers.get('retry-after'));
        const detail = (await response.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160);
        throw new RequestFailure(
          `HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
          retryAfter > 0 ? retryAfter * 1_000 : null,
        );
      }
      const body = (await response.json()) as { data?: { nodes?: (HealthNode | null)[] } };
      // A deleted repository comes back as null alongside an error; the rest of the batch is still good.
      const nodes = body.data?.nodes;
      if (!Array.isArray(nodes)) throw new Error('unexpected GraphQL response');
      return nodes.filter((node): node is HealthNode => typeof node?.id === 'string');
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS) throw error;
      // When GitHub says how long to wait (its secondary rate limit does), believe it.
      const asked = error instanceof RequestFailure ? error.retryAfterMs : null;
      await options.sleep(Math.min(asked ?? 2_000 * 2 ** (attempt - 1), MAX_BACKOFF_MS));
    }
  }
}

/**
 * Adds release and open issue / pull request figures to each repository.
 * This is a nice-to-have on top of the fetch: a batch that keeps failing is
 * skipped with a warning and its repositories simply have no health figures.
 */
export async function addHealth(
  repos: readonly RawRepo[],
  options: HealthOptions,
): Promise<RawRepo[]> {
  const resolved: Required<HealthOptions> = {
    fetchImpl: fetch,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: () => {},
    ...options,
  };
  const withNode = repos.filter((repo) => repo.node_id);
  const byNode = new Map<string, RawHealth>();
  let failedBatches = 0;

  const batches: string[][] = [];
  for (let offset = 0; offset < withNode.length; offset += BATCH_SIZE) {
    batches.push(withNode.slice(offset, offset + BATCH_SIZE).flatMap((repo) => repo.node_id ?? []));
  }

  const lookUp = async (ids: string[]) => {
    try {
      for (const node of await queryBatch(ids, resolved)) {
        byNode.set(node.id, {
          latest_release_at: node.latestRelease?.publishedAt ?? null,
          latest_release_tag: node.latestRelease?.tagName ?? null,
          open_issues: node.issues.totalCount,
          open_pull_requests: node.pullRequests.totalCount,
        });
      }
    } catch (error) {
      failedBatches += 1;
      const reason = error instanceof Error ? error.message : String(error);
      resolved.log(`Warning: health lookup failed for ${ids.length} repositories (${reason}).`);
    }
  };

  // One at a time, deliberately. Running these in parallel is several times faster, but
  // GitHub's secondary rate limit rejected most of the batches when four ran at once.
  if (batches.length > 0) {
    resolved.log(`Looking up releases and open issues in ${batches.length} batches...`);
  }
  for (const batch of batches) await lookUp(batch);

  resolved.log(
    `Health figures added for ${byNode.size.toLocaleString('en-US')} of ` +
      `${repos.length.toLocaleString('en-US')} repositories` +
      (failedBatches > 0 ? ` (${failedBatches} batches failed).` : '.'),
  );
  return repos.map((repo) => {
    const health = repo.node_id ? byNode.get(repo.node_id) : undefined;
    return health ? { ...repo, health } : repo;
  });
}
