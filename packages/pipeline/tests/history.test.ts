import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HistoryEntry } from '@agr/schema';
import { computeMomentum, historyMeta, shiftDate } from '../src/history/momentum';
import {
  createHistoryEntry,
  historyFile,
  listHistoryDates,
  readHistory,
  writeHistoryEntry,
} from '../src/history/store';

const entry = (date: string, stars: Record<number, number>): HistoryEntry =>
  createHistoryEntry(
    date,
    Object.entries(stars).map(([id, count]) => ({ id: Number(id), stars: count })),
  );

describe('history store', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'agr-history-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('stores one file per day and reads them back in date order', () => {
    writeHistoryEntry(dir, entry('2026-10-02', { 1: 120 }));
    writeHistoryEntry(dir, entry('2026-09-17', { 1: 100, 2: 50 }));

    expect(historyFile(dir, '2026-09-17')).toBe(path.join(dir, '2026', '09', '17.json'));
    expect(listHistoryDates(dir)).toEqual(['2026-09-17', '2026-10-02']);
    expect(readHistory(dir).map((item) => item.count)).toEqual([2, 1]);
    expect(readHistory(dir, '2026-09-18').map((item) => item.date)).toEqual(['2026-10-02']);
  });

  it('replaces an earlier run from the same day', () => {
    writeHistoryEntry(dir, entry('2026-10-02', { 1: 120 }));
    writeHistoryEntry(dir, entry('2026-10-02', { 1: 125 }));
    expect(readHistory(dir)).toEqual([entry('2026-10-02', { 1: 125 })]);
  });

  it('treats a missing directory as empty history and rejects bad dates', () => {
    expect(readHistory(path.join(dir, 'missing'))).toEqual([]);
    expect(() => historyFile(dir, '02/10/2026')).toThrow(/Invalid history date/);
  });
});

describe('computeMomentum', () => {
  it('reports nothing when there is no earlier history', () => {
    const momentum = computeMomentum(entry('2026-10-02', { 1: 500 }), []);
    expect(momentum.get(1)).toEqual({
      d1: null,
      d7: null,
      d30: null,
      rank_delta_7: null,
      is_new: false,
      spark: [500],
    });
  });

  it('measures exact windows from daily snapshots', () => {
    const history = [
      entry('2026-09-02', { 1: 1_000 }),
      entry('2026-09-25', { 1: 1_600 }),
      entry('2026-10-01', { 1: 1_950 }),
    ];
    const momentum = computeMomentum(entry('2026-10-02', { 1: 2_000 }), history).get(1);
    expect(momentum).toMatchObject({ d1: 50, d7: 400, d30: 1_000 });
  });

  it('scales the gain to the window when snapshots have a gap', () => {
    // 15 days between snapshots: 300 stars in 15 days is 140 per 7 days and 20 per day.
    const momentum = computeMomentum(entry('2026-10-02', { 1: 1_300 }), [
      entry('2026-09-17', { 1: 1_000 }),
    ]).get(1);
    expect(momentum).toMatchObject({ d1: 20, d7: 140, d30: null });
  });

  it('drops a window whose only reference is far too old', () => {
    const momentum = computeMomentum(entry('2026-10-02', { 1: 1_300 }), [
      entry('2026-06-01', { 1: 1_000 }),
    ]).get(1);
    expect(momentum).toMatchObject({ d1: null, d7: null, d30: null });
  });

  it('tracks rank changes over the week', () => {
    const history = [entry('2026-09-25', { 1: 300, 2: 200, 3: 100 })];
    const momentum = computeMomentum(entry('2026-10-02', { 1: 300, 2: 200, 3: 350 }), history);
    expect(momentum.get(3)?.rank_delta_7).toBe(2);
    expect(momentum.get(1)?.rank_delta_7).toBe(-1);
  });

  it('flags repositories that newly crossed the threshold', () => {
    const history = [entry('2026-09-25', { 1: 300 }), entry('2026-10-01', { 1: 310 })];
    const momentum = computeMomentum(entry('2026-10-02', { 1: 320, 2: 10_001 }), history);
    expect(momentum.get(2)).toMatchObject({ is_new: true, d7: null, rank_delta_7: null });
    expect(momentum.get(1)?.is_new).toBe(false);
  });

  it('stops calling a repository new after two weeks', () => {
    const history = [entry('2026-09-01', { 1: 300 }), entry('2026-09-10', { 1: 300, 2: 10_001 })];
    const momentum = computeMomentum(entry('2026-10-02', { 1: 320, 2: 10_500 }), history);
    expect(momentum.get(2)?.is_new).toBe(false);
  });

  it('samples the sparkline weekly, oldest first, ending on today', () => {
    const history = Array.from({ length: 30 }, (_, index) =>
      entry(shiftDate('2026-10-02', index - 30), { 1: 1_000 + index * 10 }),
    );
    const spark = computeMomentum(entry('2026-10-02', { 1: 1_300 }), history).get(1)?.spark ?? [];
    expect(spark).toEqual([1_020, 1_090, 1_160, 1_230, 1_300]);
  });

  it('ignores history dated on or after the current day', () => {
    const history = [entry('2026-10-02', { 1: 1 }), entry('2026-10-05', { 1: 2 })];
    expect(computeMomentum(entry('2026-10-02', { 1: 500 }), history).get(1)?.spark).toEqual([500]);
  });
});

describe('historyMeta', () => {
  it('summarises the available days', () => {
    expect(historyMeta(['2026-10-02', '2026-09-17'])).toEqual({
      days: 2,
      first: '2026-09-17',
      last: '2026-10-02',
    });
    expect(historyMeta([])).toEqual({ days: 0, first: null, last: null });
  });
});
