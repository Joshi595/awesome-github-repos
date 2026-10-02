import type { Activity, DomainSummary } from '@agr/schema';
import { useState } from 'preact/hooks';
import {
  ACTIVITY_FILTERS,
  AGE_FILTERS,
  STAR_FLOORS,
  toggle,
  type AgeFilter,
  type Filters,
} from '../../lib/filter';
import { formatCompact, formatNumber } from '../../lib/format';

export interface Facet {
  value: string;
  count: number;
}

export interface Facets {
  domains: DomainSummary[];
  /** Most common first. */
  languages: Facet[];
  topics: Facet[];
  collections: { id: string; title: string }[];
}

export const ACTIVITY_LABELS: Record<Activity, string> = {
  active: 'Pushed in the last 30 days',
  maintained: 'Pushed in the last 6 months',
  quiet: 'Quiet for 6+ months',
  unknown: 'Unknown',
};

export const AGE_LABELS: Record<AgeFilter, string> = {
  emerging: 'Under a year old',
  established: 'Over a year old',
};

interface Props {
  filters: Filters;
  facets: Facets;
  minimumStars: number;
  hasHistory: boolean;
  onChange: (filters: Filters) => void;
}

interface CheckListProps {
  options: { value: string; label: string; count?: number }[];
  selected: readonly string[];
  onToggle: (value: string) => void;
}

function CheckList({ options, selected, onToggle }: CheckListProps) {
  return (
    <div class="check-list">
      {options.map((option) => (
        <label class="check" key={option.value}>
          <input
            type="checkbox"
            checked={selected.includes(option.value)}
            onChange={() => onToggle(option.value)}
          />
          <span>{option.label}</span>
          {option.count !== undefined && <span class="count">{formatNumber(option.count)}</span>}
        </label>
      ))}
    </div>
  );
}

interface SearchableProps {
  label: string;
  facets: readonly Facet[];
  selected: readonly string[];
  visible: number;
  onToggle: (value: string) => void;
}

/** A long facet: the selected values, then the most common, narrowed by a search box. */
function SearchableFacet({ label, facets, selected, visible, onToggle }: SearchableProps) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const counts = new Map(facets.map((facet) => [facet.value, facet.count]));
  const matching = facets.filter(
    (facet) =>
      !selected.includes(facet.value) && (!needle || facet.value.toLowerCase().includes(needle)),
  );
  const options = [
    ...selected.map((value) => ({ value, label: value, count: counts.get(value) })),
    ...matching
      .slice(0, visible)
      .map((facet) => ({ value: facet.value, label: facet.value, count: facet.count })),
  ];

  return (
    <>
      <input
        class="facet-search"
        type="search"
        value={query}
        placeholder={`Find a ${label}`}
        aria-label={`Find a ${label}`}
        onInput={(event) => setQuery(event.currentTarget.value)}
      />
      <CheckList options={options} selected={selected} onToggle={onToggle} />
      {options.length === 0 && <p class="facet-empty">No {label} matches.</p>}
      {matching.length > visible && (
        <p class="facet-more">{formatNumber(matching.length - visible)} more. Type to narrow.</p>
      )}
    </>
  );
}

export function FilterPanel({ filters, facets, minimumStars, hasHistory, onChange }: Props) {
  const floors = [0, ...STAR_FLOORS];
  return (
    <div class="filter-panel">
      <details class="facet" open>
        <summary>Domain</summary>
        <CheckList
          options={facets.domains.map((domain) => ({
            value: domain.id,
            label: domain.label,
            count: domain.count,
          }))}
          selected={filters.domains}
          onToggle={(value) => onChange({ ...filters, domains: toggle(filters.domains, value) })}
        />
      </details>

      <details class="facet" open>
        <summary>Language</summary>
        <SearchableFacet
          label="language"
          facets={facets.languages}
          selected={filters.languages}
          visible={8}
          onToggle={(value) =>
            onChange({ ...filters, languages: toggle(filters.languages, value) })
          }
        />
      </details>

      <details class="facet" open>
        <summary>Topics</summary>
        <SearchableFacet
          label="topic"
          facets={facets.topics}
          selected={filters.topics}
          visible={10}
          onToggle={(value) => onChange({ ...filters, topics: toggle(filters.topics, value) })}
        />
      </details>

      <details class="facet" open>
        <summary>Stars</summary>
        <div class="segmented" role="group" aria-label="Minimum stars">
          {floors.map((floor) => (
            <button
              type="button"
              key={floor}
              aria-pressed={filters.minStars === floor}
              onClick={() => onChange({ ...filters, minStars: floor })}
            >
              {formatCompact(floor || minimumStars)}+
            </button>
          ))}
        </div>
      </details>

      <details class="facet" open>
        <summary>Activity</summary>
        <CheckList
          options={ACTIVITY_FILTERS.map((value) => ({ value, label: ACTIVITY_LABELS[value] }))}
          selected={filters.activity}
          onToggle={(value) =>
            onChange({ ...filters, activity: toggle(filters.activity, value as Activity) })
          }
        />
      </details>

      <details class="facet">
        <summary>Age</summary>
        <CheckList
          options={AGE_FILTERS.map((value) => ({ value, label: AGE_LABELS[value] }))}
          selected={filters.age}
          onToggle={(value) =>
            onChange({ ...filters, age: toggle(filters.age, value as AgeFilter) })
          }
        />
        {hasHistory && (
          <label class="check">
            <input
              type="checkbox"
              checked={filters.onlyNew}
              onChange={() => onChange({ ...filters, onlyNew: !filters.onlyNew })}
            />
            <span>New to the list</span>
          </label>
        )}
      </details>

      <details class="facet" open={filters.collection !== ''}>
        <summary>Collection</summary>
        <select
          class="select"
          aria-label="Collection"
          value={filters.collection}
          onChange={(event) => onChange({ ...filters, collection: event.currentTarget.value })}
        >
          <option value="">Any</option>
          {facets.collections.map((collection) => (
            <option value={collection.id} key={collection.id}>
              {collection.title}
            </option>
          ))}
        </select>
      </details>
    </div>
  );
}
