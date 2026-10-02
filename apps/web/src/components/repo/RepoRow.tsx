import type { IndexRepo } from '@agr/schema';
import type { ComponentChildren } from 'preact';
import {
  formatAge,
  formatCompact,
  formatNumber,
  formatSigned,
  languageColor,
} from '../../lib/format';
import { explorePath, repoPath } from '../../lib/paths';
import { ForkIcon, StarIcon } from '../ui/icons';

const TOPIC_LIMIT = 4;

interface Props {
  repo: IndexRepo;
  /** Snapshot time; ages are measured from it. */
  now: number;
  /** Position shown on the left. Defaults to the repository's overall rank. */
  position?: number;
  /** An accent figure for lists ranked by something other than stars. */
  highlight?: string;
  /** An editorial note, shown under the description. */
  note?: string;
  /** When given, the name opens the detail drawer instead of navigating. */
  onOpen?: (repo: IndexRepo, event: MouseEvent) => void;
  /** When given, topics filter in place instead of linking to the explorer. */
  onTopic?: (topic: string) => void;
  /** Row actions (save, compare). */
  children?: ComponentChildren;
}

/** One repository in a list. Renders the same on the server and in the explorer island. */
export function RepoRow({
  repo,
  now,
  position,
  highlight,
  note,
  onOpen,
  onTopic,
  children,
}: Props) {
  return (
    <li class="row">
      <span class="row-rank" aria-label={`Rank ${position ?? repo.rank}`}>
        {position ?? repo.rank}
      </span>
      <img
        class="row-avatar"
        src={`https://github.com/${repo.owner}.png?size=64`}
        alt=""
        width="28"
        height="28"
        loading="lazy"
        decoding="async"
      />
      <div class="row-body">
        <div class="row-title">
          <a
            class="row-name"
            href={repoPath(repo.name)}
            onClick={onOpen && ((event) => onOpen(repo, event))}
          >
            <span class="row-owner">{repo.owner}/</span>
            {repo.repo}
          </a>
          {repo.isNew && <span class="badge badge-new">New</span>}
          {repo.archived && <span class="badge">Archived</span>}
        </div>
        <p class="row-desc">{repo.description || 'No description provided.'}</p>
        {note && <p class="row-note">{note}</p>}
        {repo.topics.length > 0 && (
          <div class="row-topics">
            {repo.topics.slice(0, TOPIC_LIMIT).map((topic) =>
              onTopic ? (
                <button type="button" class="topic" onClick={() => onTopic(topic)}>
                  {topic}
                </button>
              ) : (
                <a class="topic" href={explorePath({ topic })}>
                  {topic}
                </a>
              ),
            )}
          </div>
        )}
      </div>
      <div class="row-meta">
        {highlight && <span class="meta-highlight">{highlight}</span>}
        <span class="meta-stars" title={`${formatNumber(repo.stars)} stars`}>
          <StarIcon />
          {formatCompact(repo.stars)}
        </span>
        {/* Rendered even when empty so the columns line up from row to row. */}
        {!highlight && (
          <span
            class={`meta-gain ${repo.d7 !== null && repo.d7 < 0 ? 'is-down' : ''}`}
            title={repo.d7 === null ? undefined : 'Stars gained per 7 days'}
          >
            {repo.d7 !== null && (
              <>
                {formatSigned(repo.d7)} <small>7d</small>
              </>
            )}
          </span>
        )}
        <span class="meta-forks" title={`${formatNumber(repo.forks)} forks`}>
          <ForkIcon />
          {formatCompact(repo.forks)}
        </span>
        <span class="meta-lang">
          {repo.language && (
            <>
              <i class="lang-dot" style={{ background: languageColor(repo.language) }} />
              {repo.language}
            </>
          )}
        </span>
        <span class="meta-pushed" title="Last push">
          {formatAge(repo.pushedAt, now)}
        </span>
      </div>
      {children && <div class="row-actions">{children}</div>}
    </li>
  );
}
