// The subpath keeps the validation library out of the browser bundle.
import {
  decodeSiteIndex,
  detailBucketOf,
  type DetailBucket,
  type RepoDetail,
  type SiteIndex,
} from '@agr/schema/site-index';
import type { ExplorerRepo } from './filter';
import { href } from './paths';
import { toSearchDoc } from './search';

/** The explorer dataset, downloaded once per page and shared by every island. */
export interface ExplorerData {
  index: SiteIndex;
  repos: ExplorerRepo[];
  byId: Map<number, ExplorerRepo>;
  /** Keyed by lower-cased `owner/name`. */
  byName: Map<string, ExplorerRepo>;
  /** Snapshot time in epoch milliseconds: the "now" all ages are measured from. */
  now: number;
}

export function toExplorerData(index: SiteIndex): ExplorerData {
  const repos = decodeSiteIndex(index).map((repo) => ({ ...repo, doc: toSearchDoc(repo) }));
  return {
    index,
    repos,
    byId: new Map(repos.map((repo) => [repo.id, repo])),
    byName: new Map(repos.map((repo) => [repo.name.toLowerCase(), repo])),
    now: Date.parse(index.generated_at),
  };
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(href(path));
  if (!response.ok) throw new Error(`Could not load ${path} (HTTP ${response.status}).`);
  return (await response.json()) as T;
}

let dataPromise: Promise<ExplorerData> | null = null;

export function loadExplorerData(): Promise<ExplorerData> {
  dataPromise ??= fetchJson<SiteIndex>('/data/index.json')
    .then(toExplorerData)
    .catch((error: unknown) => {
      dataPromise = null; // Let a later attempt retry.
      throw error;
    });
  return dataPromise;
}

const bucketPromises = new Map<number, Promise<DetailBucket>>();

/** The lazily loaded details of one repository, or `null` if it is not in the dataset. */
export async function loadDetail(id: number): Promise<RepoDetail | null> {
  const bucket = detailBucketOf(id);
  let promise = bucketPromises.get(bucket);
  if (!promise) {
    promise = fetchJson<DetailBucket>(`/data/detail/${bucket}.json`).catch((error: unknown) => {
      bucketPromises.delete(bucket);
      throw error;
    });
    bucketPromises.set(bucket, promise);
  }
  return (await promise)[String(id)] ?? null;
}
