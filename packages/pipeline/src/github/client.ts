const SEARCH_URL = 'https://api.github.com/search/repositories';
const RETRYABLE_STATUS = new Set([403, 429, 500, 502, 503, 504]);
const REQUEST_TIMEOUT_MS = 30_000;
/** GitHub allows 30 search requests a minute with a token and 10 without. */
const AUTHENTICATED_INTERVAL_MS = 2_100;
const ANONYMOUS_INTERVAL_MS = 6_500;

export interface SearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: unknown[];
}

export interface GitHubClientOptions {
  token?: string;
  maxRetries?: number;
  /** Minimum gap between requests. Defaults to GitHub's search rate limit. */
  minIntervalMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (message: string) => void;
}

export class GitHubError extends Error {
  override name = 'GitHubError';
}

/** A response worth retrying, with the wait GitHub asked for (if any). */
class RetryableResponse extends Error {
  constructor(
    message: string,
    readonly waitMs: number | null,
  ) {
    super(message);
  }
}

/** Paced, retrying access to GitHub's repository search. */
export class GitHubClient {
  private readonly token: string | undefined;
  private readonly maxRetries: number;
  private readonly minIntervalMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly log: (message: string) => void;
  private lastRequestAt = Number.NEGATIVE_INFINITY;

  constructor(options: GitHubClientOptions = {}) {
    this.token = options.token || undefined;
    this.maxRetries = options.maxRetries ?? 5;
    this.minIntervalMs =
      options.minIntervalMs ?? (this.token ? AUTHENTICATED_INTERVAL_MS : ANONYMOUS_INTERVAL_MS);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
    this.log = options.log ?? (() => {});
  }

  get authenticated(): boolean {
    return this.token !== undefined;
  }

  async searchRepositories(query: string, page = 1, perPage = 1): Promise<SearchResponse> {
    const parameters = new URLSearchParams({
      q: query,
      sort: 'stars',
      order: 'desc',
      page: String(page),
      per_page: String(perPage),
    });
    const url = `${SEARCH_URL}?${parameters}`;

    for (let attempt = 0; ; attempt += 1) {
      await this.pace();
      try {
        return await this.request(url);
      } catch (error) {
        if (error instanceof GitHubError) throw error;
        const reason = error instanceof Error ? error.message : String(error);
        if (attempt >= this.maxRetries - 1) {
          throw new GitHubError(
            `GitHub search failed after ${this.maxRetries} attempts: ${reason}`,
          );
        }
        const waitMs =
          error instanceof RetryableResponse && error.waitMs !== null
            ? error.waitMs
            : 1_000 * 2 ** attempt;
        this.log(`Request interrupted (${reason}); retrying in ${Math.ceil(waitMs / 1_000)}s...`);
        await this.sleep(waitMs);
      }
    }
  }

  private async pace(): Promise<void> {
    const waitMs = this.lastRequestAt + this.minIntervalMs - this.now();
    if (waitMs > 0) await this.sleep(waitMs);
    this.lastRequestAt = this.now();
  }

  private async request(url: string): Promise<SearchResponse> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'awesome-github-repos',
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    // Network failures reject here and are retried by the caller.
    const response = await this.fetchImpl(url, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      const message = `HTTP ${response.status}: ${detail}`;
      if (!RETRYABLE_STATUS.has(response.status))
        throw new GitHubError(`GitHub search failed (${message})`);
      throw new RetryableResponse(message, this.retryDelay(response.headers));
    }

    const body = (await response.json()) as Partial<SearchResponse>;
    if (typeof body.total_count !== 'number' || !Array.isArray(body.items)) {
      throw new GitHubError('GitHub returned an unexpected search response.');
    }
    if (body.incomplete_results) {
      // GitHub timed out internally; the result set may be short, so ask again.
      throw new RetryableResponse('incomplete search results', null);
    }
    return { total_count: body.total_count, incomplete_results: false, items: body.items };
  }

  /** How long GitHub asked us to wait, from `Retry-After` or the rate-limit reset time. */
  private retryDelay(headers: Headers): number | null {
    const retryAfter = Number(headers.get('retry-after'));
    if (retryAfter > 0) return retryAfter * 1_000;
    const reset = Number(headers.get('x-ratelimit-reset'));
    if (headers.get('x-ratelimit-remaining') === '0' && reset > 0) {
      return Math.max(1_000, reset * 1_000 - this.now() + 1_000);
    }
    return null;
  }
}
