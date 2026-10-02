import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HistoryEntry } from '@agr/schema';
import { createHistoryEntry } from '../src/history/store';
import { compareWeek, isoWeekOf, updateWeeklyReports } from '../src/history/weekly';
import {
  readNames,
  readWeeklyReports,
  writeNames,
  writeWeeklyReport,
} from '../src/history/weekly-store';

const entry = (date: string, stars: Record<number, number>): HistoryEntry =>
  createHistoryEntry(
    date,
    Object.entries(stars).map(([id, count]) => ({ id: Number(id), stars: count })),
  );
const names = { '1': 'a/one', '2': 'b/two', '3': 'c/three', '4': 'd/four' };

describe('isoWeekOf', () => {
  it('finds the Monday-to-Sunday week of a date', () => {
    expect(isoWeekOf('2026-10-02')).toEqual({
      week: '2026-W40',
      start: '2026-09-28',
      end: '2026-10-04',
    });
    expect(isoWeekOf('2026-09-28').week).toBe('2026-W40');
    expect(isoWeekOf('2026-10-04').week).toBe('2026-W40');
    expect(isoWeekOf('2026-10-05').week).toBe('2026-W41');
  });

  it('assigns days around New Year to the week that holds their Thursday', () => {
    expect(isoWeekOf('2026-01-01').week).toBe('2026-W01'); // a Thursday
    expect(isoWeekOf('2027-01-01').week).toBe('2026-W53'); // a Friday
    expect(isoWeekOf('2024-12-30').week).toBe('2025-W01'); // a Monday
  });
});

describe('compareWeek', () => {
  const baseline = entry('2026-09-27', { 1: 50_000, 2: 20_000, 3: 10_100, 4: 10_050 });
  const end = entry('2026-10-04', { 1: 50_400, 2: 22_000, 3: 10_090, 5: 10_010 });
  const report = compareWeek(
    isoWeekOf('2026-10-04'),
    baseline,
    end,
    { ...names, '5': 'e/five' },
    true,
  );

  it('ranks gainers by stars and growth by share', () => {
    expect(report.gainers.map((mover) => [mover.name, mover.gain])).toEqual([
      ['b/two', 2_000],
      ['a/one', 400],
    ]);
    expect(report.growth[0]).toMatchObject({ name: 'b/two', growth: 0.1 });
    expect(report.total_gain).toBe(2_390);
  });

  it('leaves out repositories that lost stars', () => {
    expect(report.gainers.some((mover) => mover.name === 'c/three')).toBe(false);
  });

  it('lists what entered and what left, by name', () => {
    expect(report.entered).toEqual([{ id: 5, name: 'e/five', stars: 10_010 }]);
    expect(report.left).toEqual([{ id: 4, name: 'd/four', stars: 10_050 }]);
  });

  it('records the dates compared and falls back to the id for unknown names', () => {
    expect(report).toMatchObject({
      week: '2026-W40',
      from: '2026-09-27',
      to: '2026-10-04',
      final: true,
      repository_count: 4,
    });
    expect(compareWeek(isoWeekOf('2026-10-04'), baseline, end, {}, true).left[0]?.name).toBe(
      'repository 4',
    );
  });

  it('reports rank climbers', () => {
    const before = entry('2026-09-27', { 1: 300, 2: 200, 3: 100 });
    const after = entry('2026-10-04', { 1: 300, 2: 200, 3: 350 });
    const climbers = compareWeek(isoWeekOf('2026-10-04'), before, after, names, true).climbers;
    expect(climbers).toHaveLength(1);
    expect(climbers[0]).toMatchObject({ name: 'c/three', places: 2 });
  });
});

describe('updateWeeklyReports', () => {
  const history = [
    entry('2026-09-20', { 1: 1_000 }), // W38, Sunday
    entry('2026-09-24', { 1: 1_100 }), // W39
    entry('2026-09-27', { 1: 1_200 }), // W39, Sunday
    entry('2026-09-30', { 1: 1_300 }), // W40
  ];

  it('finalises finished weeks and keeps the running week provisional', () => {
    const current = entry('2026-10-01', { 1: 1_350 });
    const { reports, toStore } = updateWeeklyReports({ current, history, stored: [], names });

    expect(reports.map((report) => [report.week, report.final, report.from, report.to])).toEqual([
      ['2026-W40', false, '2026-09-27', '2026-10-01'],
      ['2026-W39', true, '2026-09-20', '2026-09-27'],
    ]);
    expect(toStore.map((report) => report.week)).toEqual(['2026-W39']);
    expect(reports[1]?.gainers[0]?.gain).toBe(200);
  });

  it('does not recompute a stored week', () => {
    const current = entry('2026-10-01', { 1: 1_350 });
    const first = updateWeeklyReports({ current, history, stored: [], names });
    const second = updateWeeklyReports({ current, history, stored: first.toStore, names });

    expect(second.toStore).toEqual([]);
    expect(second.reports.map((report) => report.week)).toEqual(['2026-W40', '2026-W39']);
    expect(second.reports[1]).toBe(first.toStore[0]);
  });

  it('skips a week with nothing recent enough to compare against', () => {
    const current = entry('2026-10-01', { 1: 1_350 });
    const stale = [entry('2026-08-01', { 1: 900 })];
    expect(updateWeeklyReports({ current, history: stale, stored: [], names }).reports).toEqual([]);
    expect(updateWeeklyReports({ current, history: [], stored: [], names }).reports).toEqual([]);
  });

  it('finalises the last week once the next one starts', () => {
    const monday = entry('2026-10-05', { 1: 1_500 });
    const earlier = [...history, entry('2026-10-04', { 1: 1_450 })];
    const { toStore } = updateWeeklyReports({
      current: monday,
      history: earlier,
      stored: [],
      names,
    });
    expect(toStore.map((report) => report.week)).toEqual(['2026-W39', '2026-W40']);
    expect(toStore[1]).toMatchObject({ from: '2026-09-27', to: '2026-10-04', final: true });
  });
});

describe('weekly store', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'agr-weekly-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips reports and names', () => {
    const report = compareWeek(
      isoWeekOf('2026-10-04'),
      entry('2026-09-27', { 1: 100 }),
      entry('2026-10-04', { 1: 150 }),
      names,
      true,
    );
    writeWeeklyReport(dir, report);
    writeNames(dir, { '20': 'x/"quoted"', '3': 'c/three' });

    expect(readWeeklyReports(dir)).toEqual([report]);
    expect(readNames(dir)).toEqual({ '3': 'c/three', '20': 'x/"quoted"' });
  });

  it('treats a missing directory as empty', () => {
    expect(readWeeklyReports(path.join(dir, 'none'))).toEqual([]);
    expect(readNames(path.join(dir, 'none'))).toEqual({});
  });
});
