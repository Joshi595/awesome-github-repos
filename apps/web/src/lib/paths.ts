/** Site-relative links that respect the deploy base path (e.g. /awesome-github-repos/). */

const BASE = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');

export function href(path: string): string {
  return `${BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

export function repoPath(name: string): string {
  return href(`/repo/${name}/`);
}

export function topicPath(topic: string): string {
  return href(`/topics/${topic}/`);
}

export function languageSlug(language: string): string {
  return language
    .toLowerCase()
    .replace(/\+/g, 'p')
    .replace(/#/g, '-sharp')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function languagePath(language: string): string {
  return href(`/languages/${languageSlug(language)}/`);
}

export function collectionPath(id: string): string {
  return href(`/collections/${id}/`);
}

/** A link into the explorer with one filter applied. */
export function explorePath(params: Record<string, string>): string {
  const query = new URLSearchParams(params).toString();
  return href(query ? `/?${query}` : '/');
}

export function comparePath(names: readonly string[]): string {
  return href(names.length ? `/compare/?r=${names.join(',')}` : '/compare/');
}
