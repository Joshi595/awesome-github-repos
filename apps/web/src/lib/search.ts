/** Text search over repositories: every query word must match, and where it matches sets the rank. */

export interface SearchDoc {
  /** Lower-cased `owner/name`. */
  name: string;
  /** Lower-cased repository name without the owner. */
  repo: string;
  /** Topics and language, lower-cased, wrapped in spaces so whole entries can be matched. */
  tags: string;
  description: string;
}

export interface Searchable {
  name: string;
  repo: string;
  description: string;
  language: string | null;
  topics: string[];
}

const EXACT_NAME = 8;
const NAME = 4;
const TAG = 2;
const DESCRIPTION = 1;

export function toSearchDoc(repo: Searchable): SearchDoc {
  const tags = [...repo.topics, repo.language ?? ''].filter(Boolean).join(' ').toLowerCase();
  return {
    name: repo.name.toLowerCase(),
    repo: repo.repo.toLowerCase(),
    tags: ` ${tags} `,
    description: repo.description.toLowerCase(),
  };
}

/** Distinct lower-cased words of a query. */
export function tokenize(query: string): string[] {
  return [...new Set(query.toLowerCase().split(/\s+/).filter(Boolean))];
}

/**
 * Relevance of a document for the query words, or 0 when any word is missing.
 * A name match outranks a topic or language match, which outranks a
 * description match; an exact repository name beats everything.
 */
export function scoreMatch(doc: SearchDoc, tokens: readonly string[]): number {
  let score = 0;
  for (const token of tokens) {
    if (doc.repo === token || doc.name === token) score += EXACT_NAME;
    else if (doc.name.includes(token)) score += NAME;
    else if (doc.tags.includes(token)) score += TAG;
    else if (doc.description.includes(token)) score += DESCRIPTION;
    else return 0;
  }
  return score;
}
