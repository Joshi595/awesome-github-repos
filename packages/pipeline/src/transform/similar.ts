const SIMILAR_LIMIT = 6;
const SAME_LANGUAGE_BONUS = 0.05;
/** Below this cosine score two repositories only share generic topics. */
const MIN_SCORE = 0.15;

export interface SimilarityInput {
  id: number;
  language: string | null;
  topics: string[];
}

/**
 * For each repository, the ids of the repositories whose topics overlap it
 * most. Topics are weighted by rarity (IDF), so sharing `raft` counts for far
 * more than sharing `python`, and scores are cosine-normalised so repositories
 * with long topic lists don't match everything.
 */
export function computeSimilar(
  repos: readonly SimilarityInput[],
  limit = SIMILAR_LIMIT,
): Map<number, number[]> {
  const byTopic = new Map<string, number[]>();
  repos.forEach((repo, index) => {
    for (const topic of repo.topics) {
      const members = byTopic.get(topic);
      if (members) members.push(index);
      else byTopic.set(topic, [index]);
    }
  });

  const weight = new Map<string, number>();
  for (const [topic, members] of byTopic)
    weight.set(topic, Math.log(repos.length / members.length));

  const norms = repos.map((repo) =>
    Math.sqrt(repo.topics.reduce((sum, topic) => sum + (weight.get(topic) ?? 0) ** 2, 0)),
  );

  const result = new Map<number, number[]>();
  repos.forEach((repo, index) => {
    const shared = new Map<number, number>();
    for (const topic of repo.topics) {
      const topicWeight = weight.get(topic) ?? 0;
      if (topicWeight === 0) continue;
      for (const other of byTopic.get(topic) ?? []) {
        if (other !== index) shared.set(other, (shared.get(other) ?? 0) + topicWeight ** 2);
      }
    }

    const norm = norms[index] ?? 0;
    const ranked: { id: number; score: number }[] = [];
    for (const [other, dot] of shared) {
      const candidate = repos[other];
      const otherNorm = norms[other] ?? 0;
      if (!candidate || norm === 0 || otherNorm === 0) continue;
      const cosine = dot / (norm * otherNorm);
      if (cosine < MIN_SCORE) continue;
      const bonus =
        repo.language !== null && repo.language === candidate.language ? SAME_LANGUAGE_BONUS : 0;
      ranked.push({ id: candidate.id, score: cosine + bonus });
    }
    ranked.sort((a, b) => b.score - a.score || a.id - b.id);
    result.set(
      repo.id,
      ranked.slice(0, limit).map((entry) => entry.id),
    );
  });
  return result;
}
