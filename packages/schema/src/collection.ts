import { z } from 'zod';

/** An editorial collection as authored in `content/collections/*.yaml`. */
export const CollectionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  audience: z.string().min(1),
  description: z.string().min(1),
  last_reviewed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  repositories: z
    .array(z.object({ name: z.string().regex(/^[^/\s]+\/[^/\s]+$/), note: z.string().default('') }))
    .min(1),
});
export type Collection = z.infer<typeof CollectionSchema>;

/** A collection with its entries resolved to repository ids present in a snapshot. */
export const ResolvedCollectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  audience: z.string(),
  description: z.string(),
  last_reviewed: z.string(),
  entries: z.array(z.object({ id: z.number().int(), note: z.string() })),
});
export type ResolvedCollection = z.infer<typeof ResolvedCollectionSchema>;
