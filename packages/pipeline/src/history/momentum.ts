import type { HistoryEntry, HistoryMeta, Momentum } from '@agr/schema';

const DAY_MS = 86_400_000;
/** A reference snapshot may be this many days older than the window before the figure is dropped. */
const MAX_REFERENCE_SLACK_DAYS = 14;
const NEW_ENTRANT_DAYS = 14;
const SPARK_WEEKS = 12;
/** How far back history is worth loading: the sparkline is the longest window. */
export const HISTORY_LOOKBACK_DAYS = SPARK_WEEKS * 7 + 7;

export function toDay(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}

export function shiftDate(date: string, days: number): string {
  return new Date((toDay(date) + days) * DAY_MS).toISOString().slice(0, 10);
}

/** Rank by stars within one day's entry; ties broken by id, as in the snapshot. */
function ranksOf(entry: HistoryEntry): Map<string, number> {
  const ordered = Object.entries(entry.stars).sort(
    (a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]),
  );
  return new Map(ordered.map(([id], index) => [id, index + 1]));
}

/** The newest entry at least `window` days old, unless it is too old to stand in for the window. */
function referenceFor(
  earlier: readonly HistoryEntry[],
  today: number,
  window: number,
): { entry: HistoryEntry; span: number } | null {
  for (let index = earlier.length - 1; index >= 0; index -= 1) {
    const entry = earlier[index];
    if (!entry) continue;
    const span = today - toDay(entry.date);
    if (span < window) continue;
    return span <= window + MAX_REFERENCE_SLACK_DAYS ? { entry, span } : null;
  }
  return null;
}

/**
 * Derives each repository's momentum from the day's entry and the history
 * before it. Gains are scaled to the window when the reference snapshot is
 * older than the window, so a 15-day gap still yields a fair "per 7 days".
 */
export function computeMomentum(
  current: HistoryEntry,
  history: readonly HistoryEntry[],
): Map<number, Momentum> {
  const today = toDay(current.date);
  const earlier = history
    .filter((entry) => entry.date < current.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const timeline = [...earlier, current];

  const references = {
    d1: referenceFor(earlier, today, 1),
    d7: referenceFor(earlier, today, 7),
    d30: referenceFor(earlier, today, 30),
  };
  const currentRanks = ranksOf(current);
  const referenceRanks = references.d7 ? ranksOf(references.d7.entry) : null;

  // One sample per week, oldest first: the newest entry inside each 7-day slot.
  const samples: HistoryEntry[] = [];
  for (let week = SPARK_WEEKS - 1; week >= 0; week -= 1) {
    const slotEnd = today - week * 7;
    const sample = timeline.findLast((entry) => {
      const day = toDay(entry.date);
      return day <= slotEnd && day > slotEnd - 7;
    });
    if (sample) samples.push(sample);
  }

  const oldest = earlier[0];
  const result = new Map<number, Momentum>();

  for (const [id, stars] of Object.entries(current.stars)) {
    const gain = (reference: { entry: HistoryEntry; span: number } | null, window: number) => {
      const before = reference?.entry.stars[id];
      if (reference === null || before === undefined) return null;
      return Math.round(((stars - before) * window) / reference.span);
    };

    const previousRank = referenceRanks?.get(id);
    const currentRank = currentRanks.get(id);
    const firstSeen = timeline.find((entry) => entry.stars[id] !== undefined);

    result.set(Number(id), {
      d1: gain(references.d1, 1),
      d7: gain(references.d7, 7),
      d30: gain(references.d30, 30),
      rank_delta_7:
        previousRank !== undefined && currentRank !== undefined ? previousRank - currentRank : null,
      // Only meaningful once there is older history the repository is missing from.
      is_new:
        oldest !== undefined &&
        firstSeen !== undefined &&
        firstSeen.date > oldest.date &&
        today - toDay(firstSeen.date) <= NEW_ENTRANT_DAYS,
      spark: samples.flatMap((entry) => entry.stars[id] ?? []),
    });
  }
  return result;
}

export function historyMeta(dates: readonly string[]): HistoryMeta {
  const sorted = [...dates].sort();
  return { days: sorted.length, first: sorted[0] ?? null, last: sorted.at(-1) ?? null };
}
