import type { RawRepo, Repo } from '@agr/schema';
import type { Classifier } from './classify';
import { activityStatus, maturityStatus } from './signals';

/** A repository with everything derivable from its own record; rank, momentum and similar come later. */
export type BaseRepo = Omit<Repo, 'rank' | 'momentum' | 'similar'>;

/** GitHub topics trimmed, lower-cased, de-duplicated and sorted. */
export function normalizeTopics(topics: readonly string[] | null | undefined): string[] {
  const cleaned = (topics ?? []).map((topic) => topic.trim().toLowerCase()).filter(Boolean);
  return [...new Set(cleaned)].sort();
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeRepo(raw: RawRepo, classify: Classifier, now: Date): BaseRepo {
  const topics = normalizeTopics(raw.topics);
  const language = blankToNull(raw.language);
  const description = blankToNull(raw.description);
  const activity = activityStatus(raw.pushed_at, now);
  return {
    id: raw.id,
    name: raw.full_name,
    owner: raw.owner?.login ?? raw.full_name.split('/')[0] ?? '',
    url: raw.html_url,
    description,
    stars: raw.stargazers_count,
    forks: raw.forks_count,
    language,
    topics,
    avatar_url: blankToNull(raw.owner?.avatar_url),
    homepage: blankToNull(raw.homepage),
    license: blankToNull(raw.license?.name),
    created_at: raw.created_at ?? null,
    pushed_at: raw.pushed_at ?? null,
    archived: raw.archived ?? false,
    domains: classify({ name: raw.full_name, description, language, topics }),
    activity,
    maturity: maturityStatus(raw.created_at, activity, now),
  };
}
