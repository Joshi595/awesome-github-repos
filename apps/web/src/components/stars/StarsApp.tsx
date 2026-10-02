import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { loadExplorerData, type ExplorerData } from '../../lib/client-data';
import type { ExplorerRepo } from '../../lib/filter';
import { formatNumber } from '../../lib/format';
import { createList } from '../../lib/shortlists';
import {
  fetchStarredIds,
  MAX_PAGES,
  StarsFetchError,
  summariseStars,
  USERNAME_PATTERN,
  type StarsResult,
} from '../../lib/stars';
import { readPreference, useShortlists, writePreference } from '../../lib/storage';
import { href } from '../../lib/paths';
import { RepoRow } from '../repo/RepoRow';
import { SaveButton } from '../shortlist/SaveButton';

type State =
  | { status: 'idle' }
  | { status: 'loading'; count: number }
  | { status: 'error'; message: string }
  | { status: 'done'; username: string; result: StarsResult };

function errorMessage(error: unknown, username: string): string {
  if (!(error instanceof StarsFetchError)) return 'Something went wrong. Try again.';
  if (error.kind === 'not-found') return `GitHub has no user called “${username}”.`;
  if (error.kind === 'rate-limited') {
    const when = error.resetAt
      ? ` Try again after ${new Date(error.resetAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
      : ' Try again in an hour.';
    return `GitHub's hourly limit for anonymous requests from your network has been reached.${when}`;
  }
  return 'Could not reach GitHub. Check your connection and try again.';
}

function Section({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: string;
  children: ComponentChildren;
}) {
  return (
    <section class="section">
      <div class="section-head">
        <h2>{title}</h2>
        <p>{blurb}</p>
      </div>
      {children}
    </section>
  );
}

export function StarsApp() {
  const [data, setData] = useState<ExplorerData | null>(null);
  const [dataFailed, setDataFailed] = useState(false);
  const [username, setUsername] = useState('');
  const [state, setState] = useState<State>({ status: 'idle' });
  const [lists, setLists] = useShortlists();
  const [savedAs, setSavedAs] = useState<string | null>(null);

  useEffect(() => {
    loadExplorerData().then(setData, () => setDataFailed(true));
    setUsername(readPreference('stars-user') ?? '');
  }, []);

  const check = async (event: Event) => {
    event.preventDefault();
    const name = username.trim().replace(/^@/, '');
    if (!USERNAME_PATTERN.test(name)) {
      setState({ status: 'error', message: 'That is not a valid GitHub username.' });
      return;
    }
    setSavedAs(null);
    setState({ status: 'loading', count: 0 });
    try {
      const result = await fetchStarredIds(name, (count) => setState({ status: 'loading', count }));
      writePreference('stars-user', name);
      setState({ status: 'done', username: name, result });
    } catch (error) {
      setState({ status: 'error', message: errorMessage(error, name) });
    }
  };

  const summary = useMemo(
    () => (data && state.status === 'done' ? summariseStars(state.result.ids, data.repos) : null),
    [data, state],
  );
  const domainLabels = new Map(data?.index.domains.map((domain) => [domain.id, domain.label]));

  const saveAsList = (repos: ExplorerRepo[], name: string) => {
    setLists(
      createList(
        lists,
        name,
        repos.map((repo) => repo.id),
      ),
    );
    setSavedAs(name);
  };

  const rows = (repos: ExplorerRepo[], highlight?: (repo: ExplorerRepo) => string) => (
    <ol class="repo-list">
      {repos.map((repo, index) => (
        <RepoRow
          key={repo.id}
          repo={repo}
          now={data?.now ?? 0}
          position={index + 1}
          highlight={highlight?.(repo)}
        >
          <SaveButton repoId={repo.id} name={repo.name} />
        </RepoRow>
      ))}
    </ol>
  );

  return (
    <div class="stars">
      <form class="stars-form" onSubmit={check}>
        <label class="search">
          <span class="stars-at">github.com/</span>
          <input
            type="text"
            value={username}
            placeholder="username"
            aria-label="GitHub username"
            autocomplete="off"
            autocapitalize="off"
            spellcheck={false}
            onInput={(event) => setUsername(event.currentTarget.value)}
          />
        </label>
        <button
          type="submit"
          class="button button-primary"
          disabled={!username.trim() || state.status === 'loading'}
        >
          {state.status === 'loading' ? 'Checking…' : 'Check stars'}
        </button>
      </form>

      <div aria-live="polite">
        {state.status === 'loading' && (
          <p class="hint">
            Reading starred repositories from GitHub: {formatNumber(state.count)} so far…
          </p>
        )}
        {state.status === 'error' && (
          <p class="notice" role="alert">
            {state.message}
          </p>
        )}
        {dataFailed && (
          <p class="notice" role="alert">
            The repository list could not be loaded. Reload the page to try again.
          </p>
        )}
      </div>

      {state.status === 'done' && summary && data && (
        <>
          <dl class="stats stats-wide">
            <div class="stat">
              <dt>Stars read</dt>
              <dd>
                {formatNumber(state.result.ids.length)}
                {state.result.truncated && '+'}
              </dd>
            </div>
            <div class="stat">
              <dt>In this list</dt>
              <dd>{formatNumber(summary.starred.length)}</dd>
            </div>
            <div class="stat">
              <dt>Share of the list</dt>
              <dd>{((summary.starred.length / data.repos.length) * 100).toFixed(1)}%</dd>
            </div>
            <div class="stat">
              <dt>Top domain</dt>
              <dd class="stat-text">
                {summary.domains[0]
                  ? (domainLabels.get(summary.domains[0][0]) ?? summary.domains[0][0])
                  : 'n/a'}
              </dd>
            </div>
          </dl>
          {state.result.truncated && (
            <p class="hint">
              Only the {formatNumber(MAX_PAGES * 100)} most recent stars were read, to stay inside
              GitHub's limit for anonymous requests.
            </p>
          )}

          {summary.starred.length === 0 ? (
            <div class="empty">
              <h2>No overlap yet</h2>
              <p>
                None of {state.username}'s starred repositories have{' '}
                {formatNumber(data.index.minimum_stars)}+ stars. The list below shows where most
                people start.
              </p>
            </div>
          ) : (
            <div class="button-row">
              <button
                type="button"
                class="button"
                disabled={savedAs !== null}
                onClick={() => saveAsList(summary.starred, `${state.username}'s stars`)}
              >
                {savedAs ? 'Saved' : `Save these ${formatNumber(summary.starred.length)} as a list`}
              </button>
              {savedAs && (
                <a class="button" href={href('/lists/')}>
                  Open your lists
                </a>
              )}
            </div>
          )}

          {summary.recommended.length > 0 && (
            <Section
              title="You might like"
              blurb="Repositories you have not starred whose topics overlap most with the ones you have."
            >
              {rows(summary.recommended)}
            </Section>
          )}
          {summary.rising.length > 0 && (
            <Section
              title="Rising among your stars"
              blurb="The ones you starred that are gaining stars fastest right now."
            >
              {rows(summary.rising)}
            </Section>
          )}
          <Section
            title="Most-starred you have not starred"
            blurb="The biggest repositories on GitHub that are missing from your stars."
          >
            {rows(summary.missing)}
          </Section>
          {summary.starred.length > 0 && (
            <Section
              title="Your stars in the list"
              blurb={`The ${formatNumber(Math.min(summary.starred.length, 50))} most-starred of them.`}
            >
              {rows(summary.starred.slice(0, 50))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}
