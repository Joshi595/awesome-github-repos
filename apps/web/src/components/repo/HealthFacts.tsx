import type { Health } from '@agr/schema';
import { formatAge, formatNumber } from '../../lib/format';

interface Props {
  health: Health;
  archived: boolean;
  /** Snapshot time; the release age is measured from it. */
  now: number;
}

/** Maintenance figures as plain facts, not a score: the reader decides what they mean. */
export function HealthFacts({ health, archived, now }: Props) {
  const released = health.latest_release_at ? Date.parse(health.latest_release_at) : null;
  const split = health.open_issues !== null && health.open_pull_requests !== null;

  return (
    <dl class="facts">
      <dt>Latest release</dt>
      <dd>
        {!health.releases_checked ? (
          <span class="is-muted">Not checked</span>
        ) : released === null ? (
          <span class="is-muted">None published</span>
        ) : (
          <>
            {health.latest_release_tag && <code>{health.latest_release_tag}</code>}{' '}
            {formatAge(released, now)}
          </>
        )}
      </dd>
      {split ? (
        <>
          <dt>Open issues</dt>
          <dd>{formatNumber(health.open_issues ?? 0)}</dd>
          <dt>Open pull requests</dt>
          <dd>{formatNumber(health.open_pull_requests ?? 0)}</dd>
        </>
      ) : (
        <>
          <dt>Open issues and PRs</dt>
          <dd>
            {health.open_total === null ? (
              <span class="is-muted">Unknown</span>
            ) : (
              formatNumber(health.open_total)
            )}
          </dd>
        </>
      )}
      {archived && (
        <>
          <dt>Status</dt>
          <dd>Archived, read-only</dd>
        </>
      )}
    </dl>
  );
}
