/** Geometry and data helpers for the star-history chart. Pure, so they can be unit-tested. */

export interface Series {
  label: string;
  /** One value per date; `null` where the repository was not in the list yet. */
  values: (number | null)[];
}

/**
 * Round tick values covering `min..max`, about `target` of them. The first is
 * at or below `min` and the last at or above `max`, so marks never touch the frame.
 */
export function niceTicks(min: number, max: number, target = 4): number[] {
  if (min === max) {
    const pad = Math.max(1, Math.abs(min) * 0.01);
    return niceTicks(min - pad, max + pad, target);
  }
  const rough = (max - min) / target;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 2.5, 5, 10].find((factor) => factor * magnitude >= rough) ?? 10) * magnitude;
  const first = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let value = first; value < max + step; value += step) {
    // Multiples of fractional steps pick up floating-point noise.
    ticks.push(Number(value.toPrecision(12)));
    if (value >= max) break;
  }
  return ticks;
}

/**
 * Lines a repository's star samples up with the sample dates. The samples are
 * the most recent ones, so a shorter list is padded at the start.
 */
export function alignToDates(
  values: readonly number[],
  dates: readonly string[],
): (number | null)[] {
  const recent = values.slice(-dates.length);
  return [...Array<null>(dates.length - recent.length).fill(null), ...recent];
}

/**
 * Re-bases every series to "gained since the first date all of them have data
 * for", so repositories of very different sizes share one axis. Returns the
 * trimmed dates too; `null` when there are not two common dates to compare.
 */
export function gainSinceCommonStart(
  series: readonly Series[],
  dates: readonly string[],
): { dates: string[]; series: Series[] } | null {
  const start = Math.max(...series.map((item) => item.values.findIndex((value) => value !== null)));
  if (series.length === 0 || series.some((item) => item.values.every((value) => value === null))) {
    return null;
  }
  if (dates.length - start < 2) return null;
  return {
    dates: dates.slice(start),
    series: series.map((item) => {
      const base = item.values[start] ?? 0;
      return {
        label: item.label,
        values: item.values.slice(start).map((value) => (value === null ? null : value - base)),
      };
    }),
  };
}

/** Days since the Unix epoch for a `YYYY-MM-DD` date, for a time-proportional x axis. */
export function dayNumber(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}
