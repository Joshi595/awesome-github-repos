import { useEffect, useState } from 'preact/hooks';
import { loadExplorerData, type ExplorerData } from '../../lib/client-data';
import { href } from '../../lib/paths';
import {
  createList,
  decodeShare,
  DEFAULT_LIST_ID,
  deleteList,
  encodeShare,
  renameList,
  toggleRepo,
  toMarkdown,
  type Shortlist,
} from '../../lib/shortlists';
import { useShortlists } from '../../lib/storage';
import { RepoRow } from '../repo/RepoRow';
import { TrashIcon } from '../ui/icons';

type Shared = Pick<Shortlist, 'name' | 'repoIds'>;

/** A read-only text field with a copy button; the text stays selectable if copying is blocked. */
function Copyable({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div class="copyable">
      <label>
        <span>{label}</span>
        {multiline ? (
          <textarea
            readOnly
            rows={8}
            value={value}
            onFocus={(event) => event.currentTarget.select()}
          />
        ) : (
          <input
            type="text"
            readOnly
            value={value}
            onFocus={(event) => event.currentTarget.select()}
          />
        )}
      </label>
      <button type="button" class="button" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

export function ListsApp() {
  const [lists, setLists] = useShortlists();
  const [data, setData] = useState<ExplorerData | null>(null);
  const [failed, setFailed] = useState(false);
  const [activeId, setActiveId] = useState(DEFAULT_LIST_ID);
  const [shared, setShared] = useState<Shared | null>(null);
  const [newName, setNewName] = useState('');
  const [panel, setPanel] = useState<'share' | 'export' | null>(null);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    loadExplorerData().then(setData, () => setFailed(true));
    setOrigin(window.location.origin);
    const encoded = new URLSearchParams(window.location.search).get('s');
    if (encoded) setShared(decodeShare(encoded));
  }, []);

  const active = lists.find((list) => list.id === activeId) ?? lists[0];
  const resolve = (ids: readonly number[]) => ids.flatMap((id) => data?.byId.get(id) ?? []);

  const saveShared = () => {
    if (!shared) return;
    const id = `list-${Date.now().toString(36)}`;
    setLists(createList(lists, shared.name, shared.repoIds, id));
    setActiveId(id);
    setShared(null);
    window.history.replaceState(null, '', window.location.pathname);
  };

  const addList = (event: Event) => {
    event.preventDefault();
    if (!newName.trim()) return;
    const id = `list-${Date.now().toString(36)}`;
    setLists(createList(lists, newName, [], id));
    setActiveId(id);
    setNewName('');
  };

  const sharedRepos = shared ? resolve(shared.repoIds) : [];
  const activeRepos = active ? resolve(active.repoIds) : [];
  const missing = active && data ? active.repoIds.length - activeRepos.length : 0;

  return (
    <div class="lists">
      {failed && (
        <p class="notice" role="alert">
          The repository data could not be loaded. Your lists are safe; reload the page to see them.
        </p>
      )}

      {shared && (
        <section class="panel shared-list">
          <p class="eyebrow">Shared with you</p>
          <h2>{shared.name}</h2>
          <p class="hint">
            {shared.repoIds.length} {shared.repoIds.length === 1 ? 'repository' : 'repositories'}.
            Save a copy to keep it in this browser.
          </p>
          <div class="button-row">
            <button type="button" class="button button-primary" onClick={saveShared}>
              Save a copy
            </button>
            <button type="button" class="button" onClick={() => setShared(null)}>
              Dismiss
            </button>
          </div>
          {data && (
            <ol class="repo-list">
              {sharedRepos.map((repo, index) => (
                <RepoRow key={repo.id} repo={repo} now={data.now} position={index + 1} />
              ))}
            </ol>
          )}
        </section>
      )}

      <div class="lists-layout">
        <nav class="lists-nav" aria-label="Your lists">
          <ul>
            {lists.map((list) => (
              <li key={list.id}>
                <button
                  type="button"
                  aria-current={list.id === active?.id ? 'true' : undefined}
                  onClick={() => {
                    setActiveId(list.id);
                    setPanel(null);
                  }}
                >
                  <span>{list.name}</span>
                  <span class="count">{list.repoIds.length}</span>
                </button>
              </li>
            ))}
          </ul>
          <form class="inline-form" onSubmit={addList}>
            <input
              type="text"
              value={newName}
              placeholder="New list name"
              aria-label="New list name"
              maxLength={60}
              onInput={(event) => setNewName(event.currentTarget.value)}
            />
            <button type="submit" class="button" disabled={!newName.trim()}>
              Create
            </button>
          </form>
        </nav>

        {active && (
          <section class="lists-main" aria-label={active.name}>
            <div class="lists-title">
              <input
                type="text"
                class="title-input"
                value={active.name}
                aria-label="List name"
                maxLength={60}
                onChange={(event) =>
                  setLists(renameList(lists, active.id, event.currentTarget.value))
                }
              />
              <div class="button-row">
                <button
                  type="button"
                  class="button"
                  aria-expanded={panel === 'share'}
                  disabled={active.repoIds.length === 0}
                  onClick={() => setPanel(panel === 'share' ? null : 'share')}
                >
                  Share link
                </button>
                <button
                  type="button"
                  class="button"
                  aria-expanded={panel === 'export'}
                  disabled={activeRepos.length === 0}
                  onClick={() => setPanel(panel === 'export' ? null : 'export')}
                >
                  Export Markdown
                </button>
                <button
                  type="button"
                  class="button button-danger"
                  onClick={() => {
                    setLists(deleteList(lists, active.id));
                    setActiveId(DEFAULT_LIST_ID);
                    setPanel(null);
                  }}
                >
                  {active.id === DEFAULT_LIST_ID ? 'Empty list' : 'Delete list'}
                </button>
              </div>
            </div>

            {panel === 'share' && (
              <Copyable
                label="Anyone with this link can view the list and save their own copy."
                value={`${origin}${href('/lists/')}?s=${encodeShare(active)}`}
              />
            )}
            {panel === 'export' && (
              <Copyable label="Markdown" value={toMarkdown(active.name, activeRepos)} multiline />
            )}

            {active.repoIds.length === 0 && (
              <div class="empty">
                <h2>Nothing saved here yet</h2>
                <p>Use the bookmark on any repository to add it to this list.</p>
                <a class="button button-primary" href={href('/')}>
                  Browse repositories
                </a>
              </div>
            )}
            {!data && !failed && active.repoIds.length > 0 && <p class="hint">Loading…</p>}
            {missing > 0 && (
              <p class="hint">
                {missing} saved {missing === 1 ? 'repository is' : 'repositories are'} no longer in
                the dataset and
                {missing === 1 ? ' is' : ' are'} not shown.
              </p>
            )}

            {data && (
              <ol class="repo-list">
                {activeRepos.map((repo, index) => (
                  <RepoRow key={repo.id} repo={repo} now={data.now} position={index + 1}>
                    <button
                      type="button"
                      class="icon-button"
                      aria-label={`Remove ${repo.name} from ${active.name}`}
                      title="Remove from this list"
                      onClick={() => setLists(toggleRepo(lists, active.id, repo.id))}
                    >
                      <TrashIcon />
                    </button>
                  </RepoRow>
                ))}
              </ol>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
