import { z } from 'zod';

/**
 * A repository as returned by GitHub's REST search endpoint, reduced to the
 * fields the project uses. Unknown keys are stripped on parse, which is what
 * keeps the stored raw snapshot small.
 */
/** Maintenance figures added from GitHub's GraphQL API after the search, when a token is available. */
export const RawHealthSchema = z.object({
  latest_release_at: z.string().nullable(),
  latest_release_tag: z.string().nullable(),
  open_issues: z.number().int().nonnegative(),
  open_pull_requests: z.number().int().nonnegative(),
});
export type RawHealth = z.infer<typeof RawHealthSchema>;

export const RawRepoSchema = z.object({
  id: z.number().int().positive(),
  /** GraphQL id, needed to look the repository up for the health figures. */
  node_id: z.string().nullish(),
  full_name: z.string().min(3),
  html_url: z.string().startsWith('https://github.com/'),
  description: z.string().nullish(),
  stargazers_count: z.number().int().nonnegative(),
  forks_count: z.number().int().nonnegative(),
  language: z.string().nullish(),
  topics: z.array(z.string()).nullish(),
  owner: z.object({ login: z.string(), avatar_url: z.string().nullish() }).nullish(),
  homepage: z.string().nullish(),
  license: z.object({ name: z.string().nullish() }).nullish(),
  created_at: z.string().nullish(),
  pushed_at: z.string().nullish(),
  archived: z.boolean().nullish(),
  /** Open issues and pull requests combined, as the search API reports them. */
  open_issues_count: z.number().int().nonnegative().nullish(),
  health: RawHealthSchema.nullish(),
});
export type RawRepo = z.infer<typeof RawRepoSchema>;

export const RawSnapshotSchema = z.object({
  generated_at: z.string(),
  minimum_stars: z.number().int().positive(),
  repository_count: z.number().int().nonnegative(),
  repositories: z.array(RawRepoSchema),
});
export type RawSnapshot = z.infer<typeof RawSnapshotSchema>;
