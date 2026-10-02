/**
 * Shortlists: named sets of repositories a visitor saves. These are pure
 * functions over the list data; persistence lives in `storage.ts`.
 */

export interface Shortlist {
  id: string;
  name: string;
  repoIds: number[];
}

export const DEFAULT_LIST_ID = 'saved';
const NAME_LIMIT = 60;
/** Enough for any real list while keeping a share link a sane length. */
const SHARE_LIMIT = 200;

export function defaultLists(): Shortlist[] {
  return [{ id: DEFAULT_LIST_ID, name: 'Saved', repoIds: [] }];
}

function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, NAME_LIMIT);
}

/** Coerces whatever was in storage into valid lists, always including the default one. */
export function sanitizeLists(value: unknown): Shortlist[] {
  const lists: Shortlist[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(value) ? value : []) {
    if (typeof item !== 'object' || item === null) continue;
    const { id, name, repoIds } = item as Record<string, unknown>;
    if (typeof id !== 'string' || !id || seen.has(id) || typeof name !== 'string') continue;
    seen.add(id);
    const ids = Array.isArray(repoIds)
      ? repoIds.filter((entry) => Number.isInteger(entry) && entry > 0)
      : [];
    lists.push({ id, name: cleanName(name) || 'Untitled', repoIds: [...new Set(ids as number[])] });
  }
  return seen.has(DEFAULT_LIST_ID) ? lists : [...defaultLists(), ...lists];
}

export function isSaved(lists: readonly Shortlist[], listId: string, repoId: number): boolean {
  return lists.some((list) => list.id === listId && list.repoIds.includes(repoId));
}

export function toggleRepo(
  lists: readonly Shortlist[],
  listId: string,
  repoId: number,
): Shortlist[] {
  return lists.map((list) => {
    if (list.id !== listId) return list;
    const repoIds = list.repoIds.includes(repoId)
      ? list.repoIds.filter((id) => id !== repoId)
      : [...list.repoIds, repoId];
    return { ...list, repoIds };
  });
}

export function createList(
  lists: readonly Shortlist[],
  name: string,
  repoIds: readonly number[] = [],
  id: string = `list-${Date.now().toString(36)}`,
): Shortlist[] {
  return [...lists, { id, name: cleanName(name) || 'Untitled', repoIds: [...new Set(repoIds)] }];
}

export function renameList(lists: readonly Shortlist[], listId: string, name: string): Shortlist[] {
  const cleaned = cleanName(name);
  return lists.map((list) => (list.id === listId && cleaned ? { ...list, name: cleaned } : list));
}

/** Deleting the default list empties it instead, so "save" always has somewhere to go. */
export function deleteList(lists: readonly Shortlist[], listId: string): Shortlist[] {
  if (listId === DEFAULT_LIST_ID) {
    return lists.map((list) => (list.id === listId ? { ...list, repoIds: [] } : list));
  }
  return lists.filter((list) => list.id !== listId);
}

/** A compact, URL-safe form of a list: `<name>~<id>.<id>...` with ids in base 36. */
export function encodeShare(list: Pick<Shortlist, 'name' | 'repoIds'>): string {
  const ids = list.repoIds.slice(0, SHARE_LIMIT).map((id) => id.toString(36));
  return `${encodeURIComponent(list.name)}~${ids.join('.')}`;
}

export function decodeShare(value: string): Pick<Shortlist, 'name' | 'repoIds'> | null {
  const separator = value.lastIndexOf('~');
  if (separator < 0) return null;
  let name: string;
  try {
    name = cleanName(decodeURIComponent(value.slice(0, separator)));
  } catch {
    return null;
  }
  const repoIds = value
    .slice(separator + 1)
    .split('.')
    .filter((part) => /^[0-9a-z]+$/.test(part))
    .map((part) => Number.parseInt(part, 36))
    .filter((id) => Number.isSafeInteger(id) && id > 0)
    .slice(0, SHARE_LIMIT);
  if (repoIds.length === 0) return null;
  return { name: name || 'Shared list', repoIds: [...new Set(repoIds)] };
}

export interface MarkdownRepo {
  name: string;
  url: string;
  description: string;
  stars: number;
}

export function toMarkdown(name: string, repos: readonly MarkdownRepo[]): string {
  const lines = repos.map((repo) => {
    const description = repo.description.replace(/\s+/g, ' ').trim();
    const stars = repo.stars.toLocaleString('en-US');
    return `- [${repo.name}](${repo.url}) (★ ${stars})${description ? `: ${description}` : ''}`;
  });
  return [`# ${name}`, '', ...lines, ''].join('\n');
}
