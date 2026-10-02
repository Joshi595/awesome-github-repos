import type { IndexRepo } from '@agr/schema';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { loadExplorerData, type ExplorerData } from '../../lib/client-data';
import {
  activeChips,
  DEFAULT_FILTERS,
  filterRepos,
  isUnfiltered,
  removeChip,
  SORT_KEYS,
  SORT_LABELS,
  toggle,
  type Chip,
  type Filters,
  type SortKey,
} from '../../lib/filter';
import { formatCompact, formatDate, formatNumber } from '../../lib/format';
import { buildVocabulary, correctQuery } from '../../lib/search';
import { readPreference, writePreference } from '../../lib/storage';
import { parseFilters, serializeFilters } from '../../lib/url-state';
import { RepoRow } from '../repo/RepoRow';
import { CompareButton, SaveButton } from '../shortlist/SaveButton';
import { CloseIcon, FilterIcon, GridIcon, ListIcon, SearchIcon } from '../ui/icons';
import { CompareTray } from './CompareTray';
import { ACTIVITY_LABELS, AGE_LABELS, FilterPanel, type Facet, type Facets } from './FilterPanel';
import { RepoDrawer } from './RepoDrawer';

const PAGE_SIZE = 50;
const URL_WRITE_DELAY_MS = 250;

interface Props {
  /** The top repositories, rendered into the page so it is useful before the dataset loads. */
  initialRepos: IndexRepo[];
  total: number;
  generatedAt: string;
  minimumStars: number;
  hasHistory: boolean;
  facets: Facets;
}

type View = 'list' | 'cards';

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

function countFacets(values: Iterable<string>, order: readonly string[]): Facet[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return order.map((value) => ({ value, count: counts.get(value) ?? 0 }));
}

export function Explorer(props: Props) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [data, setData] = useState<ExplorerData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [view, setView] = useState<View>('list');
  const [openId, setOpenId] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const urlTimer = useRef<ReturnType<typeof setTimeout>>();

  const load = () => {
    setLoadError(false);
    loadExplorerData().then(setData, () => setLoadError(true));
  };

  // The server renders the default view; the URL and saved preferences apply once mounted.
  useEffect(() => {
    const fromUrl = () => setFilters(parseFilters(new URLSearchParams(window.location.search)));
    fromUrl();
    if (readPreference('view') === 'cards') setView('cards');
    load();
    window.addEventListener('popstate', fromUrl);
    return () => window.removeEventListener('popstate', fromUrl);
  }, []);

  const writeUrl = (next: Filters, mode: 'push' | 'replace') => {
    const query = serializeFilters(next).toString();
    const url = `${window.location.pathname}${query ? `?${query}` : ''}`;
    if (mode === 'push') window.history.pushState(null, '', url);
    else window.history.replaceState(null, '', url);
  };

  /** Applies a filter change. Discrete changes get a history entry; typing does not. */
  const update = (next: Filters, mode: 'push' | 'typing' = 'push') => {
    setFilters(next);
    setLimit(PAGE_SIZE);
    clearTimeout(urlTimer.current);
    if (mode === 'push') writeUrl(next, 'push');
    else urlTimer.current = setTimeout(() => writeUrl(next, 'replace'), URL_WRITE_DELAY_MS);
  };

  const vocabulary = useMemo(() => (data ? buildVocabulary(data.repos) : null), [data]);

  /** The matches, plus the corrected query when a mistyped one found nothing. */
  const [results, corrected] = useMemo<[IndexRepo[] | null, string | null]>(() => {
    if (!data || !vocabulary) {
      // Until the dataset arrives only the default view can be shown.
      const initial = isUnfiltered(filters) && filters.sort === 'stars' ? props.initialRepos : null;
      return [initial, null];
    }
    const exact = filterRepos(data.repos, filters, data.index.collections);
    if (exact.length > 0 || !filters.q.trim()) return [exact, null];
    const suggestion = correctQuery(filters.q, vocabulary);
    if (!suggestion) return [exact, null];
    const retry = filterRepos(data.repos, { ...filters, q: suggestion }, data.index.collections);
    return retry.length > 0 ? [retry, suggestion] : [exact, null];
  }, [data, vocabulary, filters, props.initialRepos]);

  const facets = useMemo<Facets>(() => {
    if (!data) return props.facets;
    return {
      domains: data.index.domains,
      languages: countFacets(
        data.repos.flatMap((repo) => repo.language ?? []),
        data.index.languages,
      ),
      topics: countFacets(
        data.repos.flatMap((repo) => repo.topics),
        data.index.topics,
      ),
      collections: data.index.collections.map(({ id, title }) => ({ id, title })),
    };
  }, [data, props.facets]);

  const total = data ? (results?.length ?? 0) : results ? props.total : 0;
  const visible = results?.slice(0, limit) ?? [];
  const now = Date.parse(props.generatedAt);
  const openRepo = openId !== null ? data?.byId.get(openId) : undefined;
  const chips = activeChips(filters);

  const chipLabel = (chip: Chip): string => {
    switch (chip.key) {
      case 'q':
        return `“${chip.value}”`;
      case 'domain':
        return facets.domains.find((domain) => domain.id === chip.value)?.label ?? chip.value;
      case 'collection':
        return (
          facets.collections.find((collection) => collection.id === chip.value)?.title ?? chip.value
        );
      case 'activity':
        return ACTIVITY_LABELS[chip.value as keyof typeof ACTIVITY_LABELS] ?? chip.value;
      case 'age':
        return AGE_LABELS[chip.value as keyof typeof AGE_LABELS] ?? chip.value;
      case 'stars':
        return `${formatCompact(Number(chip.value))}+ stars`;
      case 'new':
        return 'New to the list';
      default:
        return chip.value;
    }
  };

  const openDrawer = (repo: IndexRepo, event: MouseEvent) => {
    // Without the dataset, or when the visitor asks for a new tab, fall through to the full page.
    if (!data || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    setOpenId(repo.id);
  };

  const addTopic = (topic: string) => {
    setOpenId(null);
    if (!filters.topics.includes(topic))
      update({ ...filters, topics: toggle(filters.topics, topic) });
  };

  const changeView = (next: View) => {
    setView(next);
    writePreference('view', next);
  };

  // "/" focuses search; j and k step through the result links.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isTyping(event.target) ||
        openId !== null
      )
        return;
      if (event.key === '/') {
        event.preventDefault();
        searchInput.current?.focus();
      } else if (event.key === 'j' || event.key === 'k') {
        const links = [...(list.current?.querySelectorAll<HTMLAnchorElement>('.row-name') ?? [])];
        const current = links.indexOf(document.activeElement as HTMLAnchorElement);
        const next =
          event.key === 'j' ? Math.min(current + 1, links.length - 1) : Math.max(current - 1, 0);
        links[next]?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId]);

  return (
    <div class="explorer">
      {panelOpen && <div class="filters-backdrop" onClick={() => setPanelOpen(false)} />}
      <aside class={`explorer-filters ${panelOpen ? 'is-open' : ''}`} aria-label="Filters">
        <div class="filters-head">
          <h2>Filters</h2>
          {chips.length > 0 && (
            <button
              type="button"
              class="link-button"
              onClick={() => update({ ...DEFAULT_FILTERS, sort: filters.sort })}
            >
              Clear all
            </button>
          )}
          <button
            type="button"
            class="icon-button filters-close"
            aria-label="Close filters"
            onClick={() => setPanelOpen(false)}
          >
            <CloseIcon />
          </button>
        </div>
        <FilterPanel
          filters={filters}
          facets={facets}
          minimumStars={props.minimumStars}
          hasHistory={props.hasHistory}
          onChange={update}
        />
      </aside>

      <section class="explorer-results" aria-label="Repositories">
        <div class="search">
          <SearchIcon />
          <input
            ref={searchInput}
            type="search"
            value={filters.q}
            placeholder="Search repositories, owners, topics, languages"
            aria-label="Search repositories"
            autocomplete="off"
            spellcheck={false}
            onInput={(event) => update({ ...filters, q: event.currentTarget.value }, 'typing')}
          />
          <kbd>/</kbd>
        </div>

        <div class="toolbar">
          <p class="toolbar-count" aria-live="polite">
            {results === null ? (
              'Loading…'
            ) : (
              <>
                <strong>{formatNumber(total)}</strong> {total === 1 ? 'repository' : 'repositories'}
                <span class="toolbar-date"> · updated {formatDate(props.generatedAt)}</span>
              </>
            )}
          </p>
          <div class="toolbar-controls">
            <button
              type="button"
              class="button filters-toggle"
              aria-expanded={panelOpen}
              onClick={() => setPanelOpen(!panelOpen)}
            >
              <FilterIcon /> Filters
              {chips.length > 0 && <span class="count-pill">{chips.length}</span>}
            </button>
            <label class="sort">
              <span>Sort</span>
              <select
                class="select"
                value={filters.sort}
                onChange={(event) =>
                  update({ ...filters, sort: event.currentTarget.value as SortKey })
                }
              >
                {SORT_KEYS.filter((key) => key !== 'gain7' || props.hasHistory).map((key) => (
                  <option value={key} key={key}>
                    {SORT_LABELS[key]}
                  </option>
                ))}
              </select>
            </label>
            <div class="segmented view-toggle" role="group" aria-label="Layout">
              <button
                type="button"
                aria-pressed={view === 'list'}
                aria-label="List view"
                onClick={() => changeView('list')}
              >
                <ListIcon />
              </button>
              <button
                type="button"
                aria-pressed={view === 'cards'}
                aria-label="Card view"
                onClick={() => changeView('cards')}
              >
                <GridIcon />
              </button>
            </div>
          </div>
        </div>

        {chips.length > 0 && (
          <div class="chips" aria-label="Active filters">
            {chips.map((chip) => (
              <span class="chip" key={`${chip.key}:${chip.value}`}>
                {chipLabel(chip)}
                <button
                  type="button"
                  aria-label={`Remove filter ${chipLabel(chip)}`}
                  onClick={() => update(removeChip(filters, chip))}
                >
                  <CloseIcon />
                </button>
              </span>
            ))}
          </div>
        )}

        {corrected && (
          <p class="correction" role="status">
            No matches for “{filters.q.trim()}”. Showing results for{' '}
            <button
              type="button"
              class="link-button"
              onClick={() => update({ ...filters, q: corrected })}
            >
              {corrected}
            </button>
            .
          </p>
        )}

        {loadError && (
          <div class="notice" role="alert">
            <p>The repository data could not be loaded, so search and filters are unavailable.</p>
            <button type="button" class="button" onClick={load}>
              Try again
            </button>
          </div>
        )}

        {results !== null && results.length === 0 && (
          <div class="empty">
            <h2>No repositories match</h2>
            <p>Remove a filter or try a broader search.</p>
            <button
              type="button"
              class="button"
              onClick={() => update({ ...DEFAULT_FILTERS, sort: filters.sort })}
            >
              Clear all filters
            </button>
          </div>
        )}

        <ol class={`repo-list ${view === 'cards' ? 'is-cards' : ''}`} ref={list}>
          {visible.map((repo) => (
            <RepoRow key={repo.id} repo={repo} now={now} onOpen={openDrawer} onTopic={addTopic}>
              <SaveButton repoId={repo.id} name={repo.name} />
              <CompareButton repoId={repo.id} name={repo.name} />
            </RepoRow>
          ))}
        </ol>

        {results !== null && results.length > limit && (
          <div class="more">
            <button type="button" class="button" onClick={() => setLimit(limit + PAGE_SIZE)}>
              Show {Math.min(PAGE_SIZE, results.length - limit)} more
            </button>
            <span class="hint">
              Showing {formatNumber(limit)} of {formatNumber(results.length)}
            </span>
          </div>
        )}
        {data === null && results !== null && !loadError && (
          <p class="hint more">Loading the full list…</p>
        )}
      </section>

      {openRepo && data && (
        <RepoDrawer
          repo={openRepo}
          data={data}
          onClose={() => setOpenId(null)}
          onOpenRepo={setOpenId}
          onTopic={addTopic}
        />
      )}
      <CompareTray data={data} />
    </div>
  );
}
