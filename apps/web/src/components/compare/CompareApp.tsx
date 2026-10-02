import type { RepoDetail } from '@agr/schema';
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { loadDetail, loadExplorerData, type ExplorerData } from '../../lib/client-data';
import { DEFAULT_FILTERS, filterRepos, type ExplorerRepo } from '../../lib/filter';
import {
  activityLabel,
  formatAge,
  formatCompact,
  formatDate,
  formatDuration,
  formatNumber,
  formatSigned,
} from '../../lib/format';
import { comparePath, explorePath, href, repoPath } from '../../lib/paths';
import { MAX_COMPARE, useCompare } from '../../lib/storage';
import { alignToDates, gainSinceCommonStart } from '../../lib/chart';
import { CloseIcon } from '../ui/icons';
import { TrendChart } from '../ui/TrendChart';

const SUGGESTION_LIMIT = 6;

interface Metric {
  label: string;
  /** The number to compare on; the highest (or lowest) gets highlighted. */
  value?: (repo: ExplorerRepo) => number | null;
  lowerIsBetter?: boolean;
  render: (repo: ExplorerRepo, detail: RepoDetail | undefined) => ComponentChildren;
}

function signed(value: number | null) {
  if (value === null) return <span class="is-muted">n/a</span>;
  return <span class={value < 0 ? 'is-down' : 'is-up'}>{formatSigned(value)}</span>;
}

export function CompareApp() {
  const [data, setData] = useState<ExplorerData | null>(null);
  const [failed, setFailed] = useState(false);
  const [stored, setStored] = useCompare();
  const [ids, setIds] = useState<number[] | null>(null);
  const [details, setDetails] = useState<Record<number, RepoDetail>>({});
  const [query, setQuery] = useState('');

  useEffect(() => {
    loadExplorerData().then(setData, () => setFailed(true));
  }, []);

  // Names in the URL win, so a shared link shows what its sender saw; otherwise use the saved selection.
  useEffect(() => {
    if (!data || ids !== null) return;
    const names = (new URLSearchParams(window.location.search).get('r') ?? '')
      .split(',')
      .filter(Boolean);
    const fromUrl = names.flatMap((name) => data.byName.get(name.toLowerCase())?.id ?? []);
    setIds((fromUrl.length > 0 ? [...new Set(fromUrl)] : stored).slice(0, MAX_COMPARE));
  }, [data, stored, ids]);

  const repos = (ids ?? []).flatMap((id) => data?.byId.get(id) ?? []);

  useEffect(() => {
    for (const id of ids ?? []) {
      if (details[id]) continue;
      loadDetail(id).then(
        (detail) => detail && setDetails((current) => ({ ...current, [id]: detail })),
        () => {},
      );
    }
  }, [ids]);

  const change = (next: number[]) => {
    setIds(next);
    setStored(next);
    const names = next.flatMap((id) => data?.byId.get(id)?.name ?? []);
    window.history.replaceState(null, '', comparePath(names));
  };

  if (failed) {
    return (
      <p class="notice" role="alert">
        The repository data could not be loaded. Reload the page to try again.
      </p>
    );
  }
  if (!data || ids === null) return <p class="hint">Loading…</p>;

  const suggestions = query.trim()
    ? filterRepos(data.repos, { ...DEFAULT_FILTERS, q: query })
        .filter((repo) => !ids.includes(repo.id))
        .slice(0, SUGGESTION_LIMIT)
    : [];
  const domainLabels = new Map(data.index.domains.map((domain) => [domain.id, domain.label]));
  const shared =
    repos.length > 1
      ? (repos[0]?.topics ?? []).filter((topic) =>
          repos.every((repo) => repo.topics.includes(topic)),
        )
      : [];

  const metrics: Metric[] = [
    {
      label: 'Rank',
      value: (repo) => repo.rank,
      lowerIsBetter: true,
      render: (repo) => `#${formatNumber(repo.rank)}`,
    },
    { label: 'Stars', value: (repo) => repo.stars, render: (repo) => formatNumber(repo.stars) },
    { label: 'Forks', value: (repo) => repo.forks, render: (repo) => formatNumber(repo.forks) },
    { label: 'Gain per 7 days', value: (repo) => repo.d7, render: (repo) => signed(repo.d7) },
    { label: 'Gain per 30 days', value: (repo) => repo.d30, render: (repo) => signed(repo.d30) },
    { label: 'Age', render: (repo) => formatDuration(repo.createdAt, data.now) },
    {
      label: 'Latest release',
      render: (_repo, detail) => {
        if (!detail) return '…';
        if (!detail.health.releases_checked) return <span class="is-muted">not checked</span>;
        if (!detail.health.latest_release_at) return <span class="is-muted">none published</span>;
        return `${detail.health.latest_release_tag ?? ''} ${formatAge(Date.parse(detail.health.latest_release_at), data.now)}`.trim();
      },
    },
    {
      label: 'Open issues and PRs',
      render: (_repo, detail) => {
        if (!detail) return '…';
        const { open_issues: issues, open_pull_requests: pulls, open_total: total } = detail.health;
        if (issues !== null && pulls !== null) {
          return `${formatNumber(issues)} issues, ${formatNumber(pulls)} PRs`;
        }
        return total === null ? <span class="is-muted">unknown</span> : formatNumber(total);
      },
    },
    {
      label: 'Last push',
      value: (repo) => repo.pushedAt,
      render: (repo) => formatAge(repo.pushedAt, data.now),
    },
    { label: 'Activity', render: (repo) => activityLabel(repo.activity) },
    { label: 'Language', render: (repo) => repo.language ?? <span class="is-muted">none</span> },
    {
      label: 'License',
      render: (repo, detail) =>
        detail?.license ?? (repo.hasLicense ? '…' : <span class="is-muted">none</span>),
    },
    {
      label: 'Domains',
      render: (repo) => repo.domains.map((domain) => domainLabels.get(domain) ?? domain).join(', '),
    },
    {
      label: 'Other topics',
      render: (repo) => {
        const own = repo.topics.filter((topic) => !shared.includes(topic));
        return own.length > 0 ? (
          <div class="row-topics">
            {own.slice(0, 10).map((topic) => (
              <a class="topic" href={explorePath({ topic })} key={topic}>
                {topic}
              </a>
            ))}
          </div>
        ) : (
          <span class="is-muted">none</span>
        );
      },
    },
  ];

  // Repositories differ in size by orders of magnitude, so the chart shows stars gained
  // since the first date they all have data for, on one shared axis.
  const samples = data.index.history.samples;
  const trend =
    repos.length > 0 && repos.every((repo) => details[repo.id])
      ? gainSinceCommonStart(
          repos.map((repo) => ({
            label: repo.name,
            values: alignToDates(details[repo.id]?.spark ?? [], samples),
          })),
          samples,
        )
      : null;

  /** The id of the repository that leads a metric, when there is a single clear leader. */
  const leader = (metric: Metric): number | null => {
    if (!metric.value || repos.length < 2) return null;
    const scored = repos.flatMap((repo) => {
      const value = metric.value?.(repo) ?? null;
      return value === null ? [] : [{ id: repo.id, value: metric.lowerIsBetter ? -value : value }];
    });
    const best = Math.max(...scored.map((entry) => entry.value));
    const leaders = scored.filter((entry) => entry.value === best);
    return leaders.length === 1 ? (leaders[0]?.id ?? null) : null;
  };

  return (
    <div class="compare">
      {ids.length < MAX_COMPARE && (
        <div class="compare-add">
          <label class="search">
            <input
              type="search"
              value={query}
              placeholder={
                repos.length === 0 ? 'Search for a repository to compare' : 'Add another repository'
              }
              aria-label="Add a repository to compare"
              autocomplete="off"
              onInput={(event) => setQuery(event.currentTarget.value)}
            />
          </label>
          {suggestions.length > 0 && (
            <ul class="suggestions">
              {suggestions.map((repo) => (
                <li key={repo.id}>
                  <button
                    type="button"
                    onClick={() => {
                      change([...ids, repo.id]);
                      setQuery('');
                    }}
                  >
                    <span>{repo.name}</span>
                    <span class="palette-detail">★ {formatCompact(repo.stars)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {repos.length === 0 ? (
        <div class="empty">
          <h2>Nothing to compare yet</h2>
          <p>Search above, or use the compare button on any repository in the explorer.</p>
          <a class="button button-primary" href={href('/')}>
            Browse repositories
          </a>
        </div>
      ) : (
        <>
          {repos.length === 1 && <p class="hint">Add at least one more repository to compare.</p>}
          {trend && (
            <section class="panel">
              <h2>Stars gained since {formatDate(trend.dates[0] ?? '')}</h2>
              <TrendChart dates={trend.dates} series={trend.series} measure="Stars gained" signed />
            </section>
          )}
          <div class="table-scroll">
            <table class="compare-table">
              <thead>
                <tr>
                  <th scope="col">
                    <span class="visually-hidden">Metric</span>
                  </th>
                  {repos.map((repo) => (
                    <th scope="col" key={repo.id}>
                      <div class="compare-head">
                        <img
                          src={`https://github.com/${repo.owner}.png?size=64`}
                          alt=""
                          width="28"
                          height="28"
                        />
                        <a href={repoPath(repo.name)}>{repo.name}</a>
                        <button
                          type="button"
                          class="icon-button"
                          aria-label={`Remove ${repo.name}`}
                          onClick={() => change(ids.filter((id) => id !== repo.id))}
                        >
                          <CloseIcon />
                        </button>
                      </div>
                      <p class="compare-desc">{repo.description}</p>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.map((metric) => {
                  const best = leader(metric);
                  return (
                    <tr key={metric.label}>
                      <th scope="row">{metric.label}</th>
                      {repos.map((repo) => (
                        <td key={repo.id} class={best === repo.id ? 'is-best' : ''}>
                          {metric.render(repo, details[repo.id])}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                {repos.length > 1 && (
                  <tr>
                    <th scope="row">Shared topics</th>
                    <td colSpan={repos.length}>
                      {shared.length > 0 ? (
                        <div class="row-topics">
                          {shared.map((topic) => (
                            <a class="topic" href={explorePath({ topic })} key={topic}>
                              {topic}
                            </a>
                          ))}
                        </div>
                      ) : (
                        <span class="is-muted">These repositories have no topics in common.</span>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
