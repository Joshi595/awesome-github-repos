/** GitHub's search API never returns more than this many results for one query. */
export const MAX_RESULTS_PER_QUERY = 1_000;

/** An inclusive star range and how many repositories it held when counted. */
export interface StarRange {
  min: number;
  max: number;
  count: number;
}

export function rangeQuery(min: number, max: number | null): string {
  return max === null ? `stars:>=${min}` : `stars:${min}..${max}`;
}

/**
 * Splits `min..max` into ranges that each stay within GitHub's result cap,
 * highest stars first, by bisecting any range that is too full.
 */
export async function splitRanges(
  countRange: (min: number, max: number) => Promise<number>,
  min: number,
  max: number,
  cap = MAX_RESULTS_PER_QUERY,
): Promise<StarRange[]> {
  const count = await countRange(min, max);
  if (count <= cap) return count > 0 ? [{ min, max, count }] : [];

  if (min === max) {
    throw new Error(
      `${count.toLocaleString('en-US')} repositories have exactly ${min.toLocaleString('en-US')} stars. ` +
        "This cannot be fully retrieved through GitHub's search API in one query.",
    );
  }

  const midpoint = Math.floor((min + max) / 2);
  const upper = await splitRanges(countRange, midpoint + 1, max, cap);
  const lower = await splitRanges(countRange, min, midpoint, cap);
  return [...upper, ...lower];
}
