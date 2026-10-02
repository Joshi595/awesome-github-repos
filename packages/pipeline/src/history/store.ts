import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { HistoryEntrySchema, type HistoryEntry } from '@agr/schema';
import { writeFileAtomic } from '../io';

/**
 * Daily star history, one append-only file per day at
 * `<dir>/YYYY/MM/DD.json`, so each day adds a small new file instead of
 * rewriting a growing one.
 */

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function historyFile(dir: string, date: string): string {
  const match = DATE_PATTERN.exec(date);
  if (!match) throw new Error(`Invalid history date "${date}".`);
  return path.join(dir, match[1] ?? '', match[2] ?? '', `${match[3]}.json`);
}

export function createHistoryEntry(
  date: string,
  repos: readonly { id: number; stars: number }[],
): HistoryEntry {
  const sorted = [...repos].sort((a, b) => a.id - b.id);
  return {
    date,
    count: sorted.length,
    stars: Object.fromEntries(sorted.map((repo) => [String(repo.id), repo.stars])),
  };
}

/** Writes the entry for its day, replacing an earlier run from the same day. */
export function writeHistoryEntry(dir: string, entry: HistoryEntry): string {
  const file = historyFile(dir, entry.date);
  writeFileAtomic(file, `${JSON.stringify(entry)}\n`);
  return file;
}

function numericNames(dir: string, pattern: RegExp): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => pattern.test(name))
    .sort();
}

/** Every recorded date, oldest first. */
export function listHistoryDates(dir: string): string[] {
  const dates: string[] = [];
  for (const year of numericNames(dir, /^\d{4}$/)) {
    for (const month of numericNames(path.join(dir, year), /^\d{2}$/)) {
      for (const file of numericNames(path.join(dir, year, month), /^\d{2}\.json$/)) {
        dates.push(`${year}-${month}-${file.slice(0, 2)}`);
      }
    }
  }
  return dates;
}

/** Entries dated `since` or later (all of them when omitted), oldest first. */
export function readHistory(dir: string, since?: string): HistoryEntry[] {
  return listHistoryDates(dir)
    .filter((date) => since === undefined || date >= since)
    .map((date) =>
      HistoryEntrySchema.parse(JSON.parse(readFileSync(historyFile(dir, date), 'utf8'))),
    );
}
