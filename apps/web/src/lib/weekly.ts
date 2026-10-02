import type { WeeklyReport } from '@agr/schema';
import { formatCompact, formatDate, formatNumber } from './format';

/** Wording shared by the weekly pages and the RSS feed. */

/** "Week 40, 2026". */
export function weekTitle(report: Pick<WeeklyReport, 'week'>): string {
  const [year = '', number = ''] = report.week.split('-W');
  return `Week ${Number(number)}, ${year}`;
}

function shortDate(date: string): string {
  return formatDate(date).replace(/, \d{4}$/, '');
}

/** "Sep 28 to Oct 4, 2026". */
export function weekRange(report: Pick<WeeklyReport, 'start' | 'end'>): string {
  return `${shortDate(report.start)} to ${formatDate(report.end)}`;
}

/** Which two snapshots the figures compare, since they can be more than a week apart. */
export function weekBasis(report: Pick<WeeklyReport, 'from' | 'to'>): string {
  return `Compares the snapshots of ${shortDate(report.from)} and ${formatDate(report.to)}.`;
}

/** One sentence on the week, for list cards and feed entries. */
export function weekSummary(report: WeeklyReport): string {
  const top = report.gainers[0];
  const parts = [
    `${formatNumber(report.total_gain)} stars gained across ${formatNumber(report.repository_count)} repositories`,
    top ? `${top.name} gained the most (+${formatCompact(top.gain)})` : null,
    report.entered.length > 0
      ? `${formatNumber(report.entered.length)} ${report.entered.length === 1 ? 'repository' : 'repositories'} joined the list`
      : null,
  ].filter(Boolean);
  return `${parts.join('; ')}.`;
}
