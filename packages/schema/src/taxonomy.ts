import { z } from 'zod';

/** Domain id given to repositories with no strong domain signal. */
export const OTHER_DOMAIN_ID = 'other';

export const DomainSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .refine((id) => id !== OTHER_DOMAIN_ID, `"${OTHER_DOMAIN_ID}" is reserved`),
  label: z.string().min(1),
  description: z.string().min(1),
  /** GitHub topics that are strong evidence for this domain. */
  topics: z.array(z.string()),
  /** Whole words or phrases looked for in the repository name and description. */
  keywords: z.array(z.string()),
  /** Primary languages that are weak evidence: they never qualify a repository alone. */
  languages: z.array(z.string()),
});
export type Domain = z.infer<typeof DomainSchema>;

export const TaxonomySchema = z
  .object({ domains: z.array(DomainSchema).min(1) })
  .refine(
    (taxonomy) =>
      new Set(taxonomy.domains.map((domain) => domain.id)).size === taxonomy.domains.length,
    'Taxonomy domain ids must be unique.',
  );
export type Taxonomy = z.infer<typeof TaxonomySchema>;

/** A domain as shown on the site: its label plus how many repositories it holds. */
export const DomainSummarySchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  count: z.number().int().nonnegative(),
});
export type DomainSummary = z.infer<typeof DomainSummarySchema>;
