import type { ExplorerData } from '../../lib/client-data';
import { comparePath } from '../../lib/paths';
import { MAX_COMPARE, useCompare } from '../../lib/storage';
import { CloseIcon } from '../ui/icons';

/** A bar that appears once repositories are queued for comparison. */
export function CompareTray({ data }: { data: ExplorerData | null }) {
  const [ids, setIds] = useCompare();
  if (ids.length === 0) return null;

  const repos = ids.flatMap((id) => data?.byId.get(id) ?? []);
  const names = repos.map((repo) => repo.name);

  return (
    <div class="tray" role="region" aria-label="Comparison">
      <span class="tray-label">
        Compare {ids.length}/{MAX_COMPARE}
      </span>
      <div class="tray-items">
        {repos.map((repo) => (
          <span class="chip" key={repo.id}>
            {repo.name}
            <button
              type="button"
              aria-label={`Remove ${repo.name} from comparison`}
              onClick={() => setIds(ids.filter((id) => id !== repo.id))}
            >
              <CloseIcon />
            </button>
          </span>
        ))}
      </div>
      <button type="button" class="button" onClick={() => setIds([])}>
        Clear
      </button>
      {ids.length >= 2 && names.length === ids.length ? (
        <a class="button button-primary" href={comparePath(names)}>
          Compare
        </a>
      ) : (
        <span class="hint">{ids.length < 2 ? 'Add one more to compare' : 'Loading…'}</span>
      )}
    </div>
  );
}
