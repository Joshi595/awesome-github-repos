import { OTHER_DOMAIN_ID, type Taxonomy } from '@agr/schema';

const TOPIC_WEIGHT = 3;
const KEYWORD_WEIGHT = 2;
const LANGUAGE_WEIGHT = 1;
/** A language match alone scores below this, so it can support a domain but never decide it. */
const QUALIFYING_SCORE = 2;
/** A secondary domain needs real evidence of its own and a score near the primary's. */
const SECONDARY_MIN_SCORE = 3;
const SECONDARY_MIN_SHARE = 0.5;
const MAX_DOMAINS = 3;

export interface ClassifierInput {
  name: string;
  description: string | null;
  language: string | null;
  topics: string[];
}

interface CompiledDomain {
  id: string;
  topics: Set<string>;
  languages: Set<string>;
  keywords: RegExp[];
}

export type Classifier = (repo: ClassifierInput) => string[];

/** Matches a keyword as a whole word or phrase, not as part of a longer word. */
function keywordPattern(keyword: string): RegExp {
  const escaped = keyword
    .trim()
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`);
}

/**
 * Builds a classifier from the editorial taxonomy. Each domain is scored on
 * topic matches, keyword matches and (weakly) the primary language; the
 * result lists the best domain first, then any close runners-up.
 */
export function createClassifier(taxonomy: Taxonomy): Classifier {
  const domains: CompiledDomain[] = taxonomy.domains.map((domain) => ({
    id: domain.id,
    topics: new Set(domain.topics),
    languages: new Set(domain.languages),
    keywords: domain.keywords.filter((keyword) => keyword.trim()).map(keywordPattern),
  }));

  return (repo) => {
    const text = `${repo.name.replace(/[/_.-]+/g, ' ')} ${repo.description ?? ''}`.toLowerCase();

    const scored = domains
      .map((domain, order) => {
        const topicHits = repo.topics.filter((topic) => domain.topics.has(topic)).length;
        const keywordHits = domain.keywords.filter((keyword) => keyword.test(text)).length;
        const languageHit = repo.language !== null && domain.languages.has(repo.language);
        const score =
          topicHits * TOPIC_WEIGHT +
          keywordHits * KEYWORD_WEIGHT +
          (languageHit ? LANGUAGE_WEIGHT : 0);
        return { id: domain.id, score, order };
      })
      .filter((domain) => domain.score >= QUALIFYING_SCORE)
      .sort((a, b) => b.score - a.score || a.order - b.order);

    const primary = scored[0];
    if (!primary) return [OTHER_DOMAIN_ID];

    const secondaries = scored
      .slice(1)
      .filter(
        (domain) =>
          domain.score >= SECONDARY_MIN_SCORE &&
          domain.score >= primary.score * SECONDARY_MIN_SHARE,
      );
    return [primary, ...secondaries].slice(0, MAX_DOMAINS).map((domain) => domain.id);
  };
}
