/**
 * Value lists shared by the schemas and the site index codec. Kept free of
 * the validation library so browser code can use them without bundling it.
 */

export const ACTIVITY_STATUSES = ['active', 'maintained', 'quiet', 'unknown'] as const;
export type Activity = (typeof ACTIVITY_STATUSES)[number];

export const MATURITY_STATUSES = [
  'emerging',
  'established',
  'established-quiet',
  'unknown',
] as const;
export type Maturity = (typeof MATURITY_STATUSES)[number];
