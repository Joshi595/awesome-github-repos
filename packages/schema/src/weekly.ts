import { z } from 'zod';

/** A repository's movement over one week. Names are stored so old reports survive renames and removals. */
export const WeeklyMoverSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  /** Stars at the end of the period. */
  stars: z.number().int().nonnegative(),
  gain: z.number().int(),
  /** Gain as a fraction of the starting count. */
  growth: z.number(),
  /** Rank places gained; positive means the repository climbed. */
  places: z.number().int(),
});
export type WeeklyMover = z.infer<typeof WeeklyMoverSchema>;

export const WeeklyListedSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  stars: z.number().int().nonnegative(),
});
export type WeeklyListed = z.infer<typeof WeeklyListedSchema>;

/** Repository names by id, kept across runs so reports can name repositories that have left. */
export const NameMapSchema = z.record(z.string(), z.string());
export type NameMap = z.infer<typeof NameMapSchema>;

/** What changed in the list during one ISO week. */
export const WeeklyReportSchema = z.object({
  /** ISO week, e.g. `2026-W40`. */
  week: z.string().regex(/^\d{4}-W\d{2}$/),
  /** Monday and Sunday of the week. */
  start: z.string(),
  end: z.string(),
  /** The two snapshot days actually compared; they can be further apart than a week. */
  from: z.string(),
  to: z.string(),
  /** `false` while the week is still running; such a report is recomputed every day. */
  final: z.boolean(),
  repository_count: z.number().int().nonnegative(),
  /** Stars gained across every repository present on both days. */
  total_gain: z.number().int(),
  gainers: z.array(WeeklyMoverSchema),
  growth: z.array(WeeklyMoverSchema),
  climbers: z.array(WeeklyMoverSchema),
  /** Newly at or above the star threshold. */
  entered: z.array(WeeklyListedSchema),
  /** No longer in the list: dropped below the threshold, deleted or made private. */
  left: z.array(WeeklyListedSchema),
});
export type WeeklyReport = z.infer<typeof WeeklyReportSchema>;
