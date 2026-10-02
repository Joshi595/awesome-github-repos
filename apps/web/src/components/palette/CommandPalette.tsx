import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { loadExplorerData, type ExplorerData } from '../../lib/client-data';
import { DEFAULT_FILTERS, filterRepos } from '../../lib/filter';
import { formatCompact } from '../../lib/format';
import { collectionPath, explorePath, repoPath } from '../../lib/paths';
import { SearchIcon } from '../ui/icons';

interface Item {
  group: 'Pages' | 'Repositories' | 'Topics' | 'Languages' | 'Collections';
  label: string;
  detail?: string;
  href: string;
}

interface Props {
  pages: { label: string; href: string }[];
}

const REPO_LIMIT = 7;
const TAG_LIMIT = 4;

function search(query: string, pages: Props['pages'], data: ExplorerData | null): Item[] {
  const needle = query.trim().toLowerCase();
  const pageItems = pages
    .filter((page) => !needle || page.label.toLowerCase().includes(needle))
    .map((page): Item => ({ group: 'Pages', ...page }));
  if (!needle || !data) return pageItems;

  const repos = filterRepos(data.repos, { ...DEFAULT_FILTERS, q: needle }).slice(0, REPO_LIMIT);
  const matching = (values: readonly string[]) =>
    values.filter((value) => value.toLowerCase().includes(needle)).slice(0, TAG_LIMIT);

  return [
    ...repos.map((repo): Item => ({
      group: 'Repositories',
      label: repo.name,
      detail: `★ ${formatCompact(repo.stars)}`,
      href: repoPath(repo.name),
    })),
    ...matching(data.index.topics).map((topic): Item => ({
      group: 'Topics',
      label: topic,
      href: explorePath({ topic }),
    })),
    ...matching(data.index.languages).map((language): Item => ({
      group: 'Languages',
      label: language,
      href: explorePath({ language }),
    })),
    ...data.index.collections
      .filter((collection) => collection.title.toLowerCase().includes(needle))
      .map((collection): Item => ({
        group: 'Collections',
        label: collection.title,
        href: collectionPath(collection.id),
      })),
    ...pageItems,
  ];
}

/** Ctrl/Cmd+K: jump to any repository, topic, language, collection or page. */
export function CommandPalette({ pages }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [data, setData] = useState<ExplorerData | null>(null);
  const [failed, setFailed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  const show = () => {
    opener.current = document.activeElement as HTMLElement | null;
    setQuery('');
    setActive(0);
    setOpen(true);
    setFailed(false);
    loadExplorerData().then(setData, () => setFailed(true));
  };
  const hide = () => {
    setOpen(false);
    opener.current?.focus();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        show();
      }
    };
    const onClick = (event: MouseEvent) => {
      if ((event.target as HTMLElement | null)?.closest('[data-palette-open]')) show();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, []);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  const items = useMemo(() => search(query, pages, data), [query, pages, data]);
  if (!open) return null;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') hide();
    else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(Math.min(active + 1, items.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(Math.max(active - 1, 0));
    } else if (event.key === 'Enter') {
      const item = items[active];
      if (item) window.location.assign(item.href);
    }
  };

  return (
    <div class="palette-layer">
      <div class="drawer-backdrop" onClick={hide} />
      <div
        class="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Quick search"
        onKeyDown={onKeyDown}
      >
        <div class="search palette-input">
          <SearchIcon />
          <input
            ref={input}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={items[active] ? `palette-item-${active}` : undefined}
            aria-label="Search repositories, topics and pages"
            placeholder="Jump to a repository, topic, language or page"
            autocomplete="off"
            spellcheck={false}
            value={query}
            onInput={(event) => {
              setQuery(event.currentTarget.value);
              setActive(0);
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <ul class="palette-results" id="palette-results" role="listbox">
          {items.map((item, index) => (
            <li
              key={`${item.group}:${item.href}`}
              id={`palette-item-${index}`}
              role="option"
              aria-selected={index === active}
              class={index === active ? 'is-active' : ''}
              onMouseEnter={() => setActive(index)}
            >
              {(index === 0 || items[index - 1]?.group !== item.group) && (
                <span class="palette-group">{item.group}</span>
              )}
              <a href={item.href} tabIndex={-1}>
                <span>{item.label}</span>
                {item.detail && <span class="palette-detail">{item.detail}</span>}
              </a>
            </li>
          ))}
          {items.length === 0 && <li class="palette-empty">Nothing matches “{query.trim()}”.</li>}
        </ul>
        {failed && (
          <p class="palette-status">
            Repository search is unavailable right now; pages still work.
          </p>
        )}
        {!failed && !data && query.trim() && <p class="palette-status">Loading repositories…</p>}
      </div>
    </div>
  );
}
