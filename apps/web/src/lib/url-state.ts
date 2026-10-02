import {
  ACTIVITY_FILTERS,
  AGE_FILTERS,
  DEFAULT_FILTERS,
  SORT_KEYS,
  STAR_FLOORS,
  type Filters,
} from './filter';

/** The explorer's filters as URL query parameters, so any view can be linked to and restored. */

function oneOf<T extends string>(allowed: readonly T[], value: string | null): T | null {
  return allowed.includes(value as T) ? (value as T) : null;
}

function allOf<T extends string>(allowed: readonly T[], values: string[]): T[] {
  return [...new Set(values)].filter((value): value is T => allowed.includes(value as T));
}

function distinct(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function parseFilters(params: URLSearchParams): Filters {
  const stars = Number(params.get('stars'));
  return {
    q: params.get('q') ?? '',
    domains: distinct(params.getAll('domain')),
    languages: distinct(params.getAll('language')),
    topics: distinct(params.getAll('topic')),
    activity: allOf(ACTIVITY_FILTERS, params.getAll('activity')),
    age: allOf(AGE_FILTERS, params.getAll('age')),
    minStars: (STAR_FLOORS as readonly number[]).includes(stars) ? stars : 0,
    collection: params.get('collection') ?? '',
    onlyNew: params.get('new') === '1',
    sort: oneOf(SORT_KEYS, params.get('sort')) ?? DEFAULT_FILTERS.sort,
  };
}

/** Only non-default values are written, so the default view has a clean URL. */
export function serializeFilters(filters: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.collection) params.set('collection', filters.collection);
  for (const domain of filters.domains) params.append('domain', domain);
  for (const language of filters.languages) params.append('language', language);
  for (const topic of filters.topics) params.append('topic', topic);
  for (const activity of filters.activity) params.append('activity', activity);
  for (const age of filters.age) params.append('age', age);
  if (filters.minStars > 0) params.set('stars', String(filters.minStars));
  if (filters.onlyNew) params.set('new', '1');
  if (filters.sort !== DEFAULT_FILTERS.sort) params.set('sort', filters.sort);
  return params;
}
