import type { HistoryEntry, NameMap, WeeklyListed, WeeklyMover, WeeklyReport } from '@agr/schema';
import { ranksOf, shiftDate, toDay } from './momentum';

const LIST_LIMIT = 15;
/** A week is compared with the last snapshot before it, as long as that one is not too stale. */
const BASELINE_MAX_GAP_DAYS = 14;

export interface IsoWeek {
  /** e.g. `2026-W40`. */
  week: string;
  /** Monday. */
  start: string;
  /** Sunday. */
  end: string;
}

/** The ISO 8601 week a date falls in. The week's year is the year of its Thursday. */
export function isoWeekOf(date: string): IsoWeek {
  const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const start = shiftDate(date, -weekday);
  const thursday = shiftDate(start, 3);
  const year = thursday.slice(0, 4);
  const number = Math.floor((toDay(thursday) - toDay(`${year}-01-01`)) / 7) + 1;
  return { week: `${year}-W${String(number).padStart(2, '0')}`, start, end: shiftDate(start, 6) };
}

export function compareWeek(
  week: IsoWeek,
  baseline: HistoryEntry,
  end: HistoryEntry,
  names: NameMap,
  final: boolean,
): WeeklyReport {
  const nameOf = (id: string) => names[id] ?? `repository ${id}`;
  const ranksBefore = ranksOf(baseline);
  const ranksAfter = ranksOf(end);

  const movers: WeeklyMover[] = [];
  const entered: WeeklyListed[] = [];
  let totalGain = 0;
  for (const [id, stars] of Object.entries(end.stars)) {
    const before = baseline.stars[id];
    if (before === undefined) {
      entered.push({ id: Number(id), name: nameOf(id), stars });
      continue;
    }
    totalGain += stars - before;
    movers.push({
      id: Number(id),
      name: nameOf(id),
      stars,
      gain: stars - before,
      growth: before > 0 ? (stars - before) / before : 0,
      places: (ranksBefore.get(id) ?? 0) - (ranksAfter.get(id) ?? 0),
    });
  }
  const left = Object.entries(baseline.stars)
    .filter(([id]) => end.stars[id] === undefined)
    .map(([id, stars]): WeeklyListed => ({ id: Number(id), name: nameOf(id), stars }));

  const top = (key: (mover: WeeklyMover) => number) =>
    movers
      .filter((mover) => key(mover) > 0)
      .sort((a, b) => key(b) - key(a) || b.stars - a.stars)
      .slice(0, LIST_LIMIT);
  const byStars = (a: WeeklyListed, b: WeeklyListed) => b.stars - a.stars || a.id - b.id;

  return {
    week: week.week,
    start: week.start,
    end: week.end,
    from: baseline.date,
    to: end.date,
    final,
    repository_count: end.count,
    total_gain: totalGain,
    gainers: top((mover) => mover.gain),
    growth: top((mover) => mover.growth),
    climbers: top((mover) => mover.places),
    entered: entered.sort(byStars),
    left: left.sort(byStars),
  };
}

export interface WeeklyInput {
  /** The snapshot's own day. */
  current: HistoryEntry;
  /** Earlier days. */
  history: readonly HistoryEntry[];
  /** Reports finalised by earlier runs. */
  stored: readonly WeeklyReport[];
  names: NameMap;
}

export interface WeeklyResult {
  /** Every report, newest first; the first may be for the week still in progress. */
  reports: WeeklyReport[];
  /** Reports for weeks that have ended and are not stored yet. */
  toStore: WeeklyReport[];
}

/**
 * Brings the weekly reports up to date. A finished week is compared once and
 * then stored for good; the running week is recomputed on every build.
 */
export function updateWeeklyReports(input: WeeklyInput): WeeklyResult {
  const timeline = [
    ...input.history.filter((entry) => entry.date < input.current.date),
    input.current,
  ].sort((a, b) => a.date.localeCompare(b.date));
  const storedWeeks = new Set(input.stored.map((report) => report.week));
  const lastOfWeek = new Map<string, { week: IsoWeek; entry: HistoryEntry }>();
  for (const entry of timeline) {
    const week = isoWeekOf(entry.date);
    lastOfWeek.set(week.week, { week, entry }); // Later days overwrite earlier ones.
  }

  const fresh: WeeklyReport[] = [];
  for (const { week, entry } of lastOfWeek.values()) {
    if (storedWeeks.has(week.week)) continue;
    const baseline = timeline.findLast(
      (candidate) =>
        candidate.date < week.start &&
        toDay(week.start) - toDay(candidate.date) <= BASELINE_MAX_GAP_DAYS,
    );
    if (!baseline) continue;
    fresh.push(compareWeek(week, baseline, entry, input.names, week.end < input.current.date));
  }

  return {
    reports: [...input.stored, ...fresh].sort((a, b) => b.week.localeCompare(a.week)),
    toStore: fresh.filter((report) => report.final),
  };
}
