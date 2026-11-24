import { z } from 'zod';

const Slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const RepoName = z.string().regex(/^[^/\s]+\/[^/\s]+$/);
const EditorialText = z.string().trim().min(1);
const GuideChoiceSchema = z.object({
  name: RepoName,
  best_fit: EditorialText,
  trade_off: EditorialText,
  docs_url: z.url({ protocol: /^https$/ }),
});
const GuideDecisionSchema = z.object({
  id: Slug,
  title: EditorialText,
  choices: z.array(GuideChoiceSchema).min(2).max(4),
});

/** An editorial collection as authored in `content/collections/*.yaml`. */
export const CollectionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(1),
    audience: z.string().min(1),
    description: z.string().min(1),
    last_reviewed: z.iso.date(),
    repositories: z
      .array(
        z.object({
          name: RepoName,
          note: z.string().default(''),
          reviewed_stars: z.number().int().nonnegative().optional(),
        }),
      )
      .min(1),
    decisions: z.array(GuideDecisionSchema).min(1).optional(),
  })
  .superRefine((collection, ctx) => {
    if (!collection.decisions) return;
    const entries = new Map(collection.repositories.map((repo) => [repo.name.toLowerCase(), repo]));
    if (entries.size !== collection.repositories.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['repositories'],
        message: 'Repositories must be unique.',
      });
    }

    const decisionIds = new Set<string>();
    for (const [index, decision] of collection.decisions.entries()) {
      if (decisionIds.has(decision.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['decisions', index, 'id'],
          message: 'Decision ids must be unique.',
        });
      }
      decisionIds.add(decision.id);
      const names = new Set<string>();
      for (const [position, choice] of decision.choices.entries()) {
        const name = choice.name.toLowerCase();
        if (!entries.has(name) || names.has(name)) {
          ctx.addIssue({
            code: 'custom',
            path: ['decisions', index, 'choices', position, 'name'],
            message: `${choice.name} must appear in repositories and only once per decision.`,
          });
        }
        names.add(name);
      }
    }
  });
export type Collection = z.infer<typeof CollectionSchema>;

const ResolvedGuideDecisionSchema = GuideDecisionSchema.extend({
  choices: z
    .array(
      GuideChoiceSchema.extend({
        id: z.number().int().nullable(),
        reviewed_stars: z.number().int().nonnegative().optional(),
      }),
    )
    .min(2)
    .max(4),
});
export type ResolvedGuideDecision = z.infer<typeof ResolvedGuideDecisionSchema>;

/** A collection with its entries resolved to repository ids present in a snapshot. */
export const ResolvedCollectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  audience: z.string(),
  description: z.string(),
  last_reviewed: z.string(),
  entries: z.array(z.object({ id: z.number().int(), note: z.string() })),
  decisions: z.array(ResolvedGuideDecisionSchema).optional(),
});
export type ResolvedCollection = z.infer<typeof ResolvedCollectionSchema>;
