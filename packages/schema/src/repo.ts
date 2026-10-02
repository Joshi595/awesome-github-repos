import { z } from 'zod';
import { ACTIVITY_STATUSES, MATURITY_STATUSES } from './enums';

export const ActivitySchema = z.enum(ACTIVITY_STATUSES);
export const MaturitySchema = z.enum(MATURITY_STATUSES);

/**
 * Star movement derived from the daily history. A window is `null` when the
 * history does not reach back far enough, or the repository was not in it.
 */
export const MomentumSchema = z.object({
  /** Stars gained per 1, 7 and 30 days, scaled to the window when snapshots have gaps. */
  d1: z.number().int().nullable(),
  d7: z.number().int().nullable(),
  d30: z.number().int().nullable(),
  /** Rank places gained over 7 days; positive means the repository climbed. */
  rank_delta_7: z.number().int().nullable(),
  /** First appeared above the star threshold within the last 14 days. */
  is_new: z.boolean(),
  /**
   * Up to 12 weekly star counts, oldest first, ending with the current count.
   * They line up with the end of the snapshot's `history.samples` dates.
   */
  spark: z.array(z.number().int()),
});
export type Momentum = z.infer<typeof MomentumSchema>;

/**
 * Maintenance figures. The combined count comes with every fetch; the split
 * counts and the release are `null` when the fetch ran without a token.
 */
export const HealthSchema = z.object({
  /** Open issues and pull requests together. */
  open_total: z.number().int().nonnegative().nullable(),
  open_issues: z.number().int().nonnegative().nullable(),
  open_pull_requests: z.number().int().nonnegative().nullable(),
  latest_release_at: z.string().nullable(),
  latest_release_tag: z.string().nullable(),
  /** Whether releases were looked up at all; `false` means "unknown", not "none". */
  releases_checked: z.boolean(),
});
export type Health = z.infer<typeof HealthSchema>;

export const RepoSchema = z.object({
  /** GitHub's numeric repository id. Stable across renames and transfers. */
  id: z.number().int().positive(),
  /** 1-based position by stars within the snapshot. */
  rank: z.number().int().positive(),
  /** `owner/name`. */
  name: z.string(),
  owner: z.string(),
  url: z.string().startsWith('https://github.com/'),
  description: z.string().nullable(),
  stars: z.number().int().nonnegative(),
  forks: z.number().int().nonnegative(),
  language: z.string().nullable(),
  topics: z.array(z.string()),
  avatar_url: z.string().nullable(),
  homepage: z.string().nullable(),
  license: z.string().nullable(),
  created_at: z.string().nullable(),
  pushed_at: z.string().nullable(),
  archived: z.boolean(),
  /** Domain ids, primary first. Never empty: falls back to `other`. */
  domains: z.array(z.string()).min(1),
  activity: ActivitySchema,
  maturity: MaturitySchema,
  health: HealthSchema,
  momentum: MomentumSchema,
  /** Ids of the most similar repositories, best match first. */
  similar: z.array(z.number().int()),
});
export type Repo = z.infer<typeof RepoSchema>;
