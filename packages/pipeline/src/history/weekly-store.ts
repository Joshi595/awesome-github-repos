import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { NameMapSchema, WeeklyReportSchema, type NameMap, type WeeklyReport } from '@agr/schema';
import { readJson, writeFileAtomic } from '../io';

/**
 * Finished weekly reports, one file per week (`<dir>/2026-W40.json`), plus
 * `names.json`: every repository name seen so far, so a report can still name
 * a repository after it has left the list.
 */

const NAMES_FILE = 'names.json';

export function readWeeklyReports(dir: string): WeeklyReport[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /^\d{4}-W\d{2}\.json$/.test(name))
    .sort()
    .map((name) => WeeklyReportSchema.parse(readJson(path.join(dir, name))));
}

export function writeWeeklyReport(dir: string, report: WeeklyReport): void {
  writeFileAtomic(path.join(dir, `${report.week}.json`), `${JSON.stringify(report)}\n`);
}

export function readNames(dir: string): NameMap {
  const file = path.join(dir, NAMES_FILE);
  return existsSync(file) ? NameMapSchema.parse(readJson(file)) : {};
}

/** Sorted by id with one name per line, so each day's change is a small diff. */
export function writeNames(dir: string, names: NameMap): void {
  const lines = Object.entries(names)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([id, name]) => `${JSON.stringify(id)}:${JSON.stringify(name)}`);
  writeFileAtomic(path.join(dir, NAMES_FILE), `{\n${lines.join(',\n')}\n}\n`);
}
