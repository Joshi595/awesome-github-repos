import { z } from 'zod';
import { ResolvedCollectionSchema } from './collection';
import { RepoSchema } from './repo';
import { DomainSummarySchema } from './taxonomy';
import { WeeklyReportSchema } from './weekly';

export const SNAPSHOT_SCHEMA_VERSION = 2;

/** One day of star counts, stored append-only on the `data` branch. */
export const HistoryEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  count: z.number().int().nonnegative(),
  /** Repository id -> star count. */
  stars: z.record(z.string(), z.number().int().nonnegative()),
});
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

/** How much history the momentum figures in a snapshot are based on. */
export const HistoryMetaSchema = z.object({
  /** Number of daily entries available, including the snapshot's own day. */
  days: z.number().int().nonnegative(),
  first: z.string().nullable(),
  last: z.string().nullable(),
  /** The dates the weekly star samples (`momentum.spark`) were taken on, oldest first. */
  samples: z.array(z.string()),
});
export type HistoryMeta = z.infer<typeof HistoryMetaSchema>;

/** The complete dataset the site is built from. */
export const SnapshotSchema = z
  .object({
    schema_version: z.literal(SNAPSHOT_SCHEMA_VERSION),
    generated_at: z.string(),
    minimum_stars: z.number().int().positive(),
    repository_count: z.number().int().nonnegative(),
    history: HistoryMetaSchema,
    domains: z.array(DomainSummarySchema),
    collections: z.array(ResolvedCollectionSchema),
    /** Weekly reports, newest first. The first may still be in progress. */
    weekly: z.array(WeeklyReportSchema),
    repositories: z.array(RepoSchema),
  })
  .refine(
    (snapshot) => snapshot.repository_count === snapshot.repositories.length,
    'repository_count does not match the number of repositories.',
  );
export type Snapshot = z.infer<typeof SnapshotSchema>;
