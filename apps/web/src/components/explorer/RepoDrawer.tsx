import type { RepoDetail } from '@agr/schema';
import { useEffect, useRef, useState } from 'preact/hooks';
import { loadDetail, type ExplorerData } from '../../lib/client-data';
import type { ExplorerRepo } from '../../lib/filter';
import {
  activityLabel,
  formatAge,
  formatCompact,
  formatDuration,
  formatNumber,
  formatSigned,
  languageColor,
} from '../../lib/format';
import { repoPath } from '../../lib/paths';
import { HealthFacts } from '../repo/HealthFacts';
import { RepoTools } from '../repo/RepoTools';
import { CompareButton, SaveButton } from '../shortlist/SaveButton';
import { SaveMenu } from '../shortlist/SaveMenu';
import { CloseIcon, ExternalIcon } from '../ui/icons';
import { Sparkline } from '../ui/Sparkline';

interface Props {
  repo: ExplorerRepo;
  data: ExplorerData;
  onClose: () => void;
  onOpenRepo: (id: number) => void;
  onTopic: (topic: string) => void;
}

function Delta({ label, value }: { label: string; value: number | null }) {
  return (
    <div class="stat">
      <dt>{label}</dt>
      <dd class={value === null ? 'is-muted' : value < 0 ? 'is-down' : 'is-up'}>
        {value === null ? 'n/a' : formatSigned(value)}
      </dd>
    </div>
  );
}

/** The detail panel for one repository, opened from a row without leaving the list. */
export function RepoDrawer({ repo, data, onClose, onOpenRepo, onTopic }: Props) {
  const [detail, setDetail] = useState<RepoDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const domainLabels = new Map(data.index.domains.map((domain) => [domain.id, domain.label]));

  useEffect(() => {
    let current = true;
    setDetail(null);
    setFailed(false);
    loadDetail(repo.id).then(
      (loaded) => current && setDetail(loaded),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [repo.id]);

  // Move focus into the panel when it opens and hand it back when it closes.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => previous?.focus();
  }, []);

  const similar = (detail?.similar ?? []).flatMap((id) => data.byId.get(id) ?? []);
  const topics = detail?.topics ?? repo.topics;

  return (
    <div class="drawer-layer">
      <div class="drawer-backdrop" onClick={onClose} />
      <aside
        class="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`${repo.name} details`}
        tabIndex={-1}
        ref={panel}
        onKeyDown={(event) => event.key === 'Escape' && onClose()}
      >
        <header class="drawer-head">
          <img src={`https://github.com/${repo.owner}.png?size=96`} alt="" width="40" height="40" />
          <div>
            <p class="drawer-rank">#{repo.rank} by stars</p>
            <h2>
              <span class="row-owner">{repo.owner}/</span>
              {repo.repo}
            </h2>
          </div>
          <button type="button" class="icon-button" aria-label="Close details" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        <div class="drawer-body">
          <p class="drawer-desc">{repo.description || 'No description provided.'}</p>

          <div class="drawer-actions">
            <a class="button button-primary" href={repo.url} target="_blank" rel="noreferrer">
              Open on GitHub <ExternalIcon />
            </a>
            <a class="button" href={repoPath(repo.name)}>
              Full page
            </a>
            <SaveButton repoId={repo.id} name={repo.name} labelled />
            <CompareButton repoId={repo.id} name={repo.name} labelled />
          </div>

          <dl class="stats">
            <div class="stat">
              <dt>Stars</dt>
              <dd title={formatNumber(repo.stars)}>{formatCompact(repo.stars)}</dd>
            </div>
            <div class="stat">
              <dt>Forks</dt>
              <dd title={formatNumber(repo.forks)}>{formatCompact(repo.forks)}</dd>
            </div>
            <div class="stat">
              <dt>Age</dt>
              <dd>{formatDuration(repo.createdAt, data.now)}</dd>
            </div>
            <div class="stat">
              <dt>Last push</dt>
              <dd>{formatAge(repo.pushedAt, data.now)}</dd>
            </div>
          </dl>

          <section>
            <h3>Momentum</h3>
            {data.index.history.days < 2 ? (
              <p class="hint">
                Trend figures appear once a second daily snapshot has been recorded.
              </p>
            ) : (
              <>
                <dl class="stats">
                  <Delta label="Per day" value={detail?.d1 ?? null} />
                  <Delta label="Per 7 days" value={repo.d7} />
                  <Delta label="Per 30 days" value={repo.d30} />
                  <Delta label="Rank, 7 days" value={repo.rankDelta7} />
                </dl>
                {detail && detail.spark.length > 1 && (
                  <div class="drawer-spark">
                    <Sparkline values={detail.spark} width={320} height={56} />
                  </div>
                )}
              </>
            )}
          </section>

          <section>
            <h3>About</h3>
            <div class="badges">
              {repo.language && (
                <span class="badge">
                  <i class="lang-dot" style={{ background: languageColor(repo.language) }} />
                  {repo.language}
                </span>
              )}
              <span class={`badge badge-${repo.activity}`}>{activityLabel(repo.activity)}</span>
              {repo.domains.map((domain) => (
                <span class="badge" key={domain}>
                  {domainLabels.get(domain) ?? domain}
                </span>
              ))}
              {detail?.license && <span class="badge">{detail.license}</span>}
              {repo.isNew && <span class="badge badge-new">New to the list</span>}
            </div>
            {detail?.homepage && (
              <p class="drawer-link">
                <a href={detail.homepage} target="_blank" rel="noreferrer nofollow">
                  {detail.homepage.replace(/^https?:\/\//, '').replace(/\/$/, '')} <ExternalIcon />
                </a>
              </p>
            )}
          </section>

          <section>
            <h3>Understand this repo</h3>
            <RepoTools name={repo.name} />
          </section>

          {detail && (
            <section>
              <h3>Maintenance</h3>
              <HealthFacts health={detail.health} archived={repo.archived} now={data.now} />
            </section>
          )}

          {topics.length > 0 && (
            <section>
              <h3>Topics</h3>
              <div class="row-topics">
                {topics.map((topic) => (
                  <button type="button" class="topic" key={topic} onClick={() => onTopic(topic)}>
                    {topic}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3>Save to a list</h3>
            <SaveMenu repoId={repo.id} />
          </section>

          <section>
            <h3>Similar repositories</h3>
            {failed && (
              <p class="hint">
                Could not load the details. Check your connection and reopen the panel.
              </p>
            )}
            {!failed && !detail && <p class="hint">Loading…</p>}
            {detail && similar.length === 0 && (
              <p class="hint">
                None found. This repository shares no distinctive topics with others.
              </p>
            )}
            <ul class="similar">
              {similar.map((other) => (
                <li key={other.id}>
                  <button type="button" onClick={() => onOpenRepo(other.id)}>
                    <span class="similar-name">{other.name}</span>
                    <span class="similar-stars">★ {formatCompact(other.stars)}</span>
                    <span class="similar-desc">{other.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </aside>
    </div>
  );
}
