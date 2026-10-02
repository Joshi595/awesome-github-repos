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

/** Words a mistyped query can be corrected to, with how many repositories use each. */
export type Vocabulary = Map<string, number>;

const MIN_WORD_LENGTH = 3;

/** Every word of every repository name, topic and language. */
export function buildVocabulary(repos: readonly Searchable[]): Vocabulary {
  const vocabulary: Vocabulary = new Map();
  const add = (word: string) => {
    if (word.length >= MIN_WORD_LENGTH) vocabulary.set(word, (vocabulary.get(word) ?? 0) + 1);
  };
  for (const repo of repos) {
    const terms = [repo.name, ...repo.topics, repo.language ?? ''].map((term) =>
      term.toLowerCase(),
    );
    const words = terms.flatMap((term) => [term, ...term.split(/[^a-z0-9+#]+/)]);
    new Set(words).forEach(add);
  }
  return vocabulary;
}

/** Levenshtein distance, giving up (and returning `limit + 1`) once it exceeds `limit`. */
export function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
      current.push(value);
      best = Math.min(best, value);
    }
    if (best > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length] ?? limit + 1;
}

/** How many typos to forgive: none in short words, where a "fix" is usually a different word. */
function allowedTypos(word: string): number {
  if (word.length < 4) return 0;
  return word.length < 8 ? 1 : 2;
}

/**
 * A corrected version of a query that found nothing, or `null` when no word
 * can be fixed. Words that already appear somewhere are left alone; each other
 * word becomes the closest known word, preferring the more common one.
 */
export function correctQuery(query: string, vocabulary: Vocabulary): string | null {
  const words = [...vocabulary.keys()];
  let changed = false;
  const corrected = tokenize(query).map((token) => {
    if (words.some((word) => word.includes(token))) return token;
    const limit = allowedTypos(token);
    let best: { word: string; distance: number; count: number } | null = null;
    for (const [word, count] of vocabulary) {
      const distance = limit === 0 ? limit + 1 : editDistance(token, word, limit);
      if (distance > limit) continue;
      if (!best || distance < best.distance || (distance === best.distance && count > best.count)) {
        best = { word, distance, count };
      }
    }
    if (!best) return null;
    changed = true;
    return best.word;
  });
  return changed && corrected.every((word) => word !== null) ? corrected.join(' ') : null;
}
