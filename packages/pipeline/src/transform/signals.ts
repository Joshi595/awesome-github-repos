import type { Activity, Maturity } from '@agr/schema';

const DAY_MS = 86_400_000;

function ageInDays(timestamp: string | null | undefined, now: Date): number | null {
  if (!timestamp) return null;
  const time = Date.parse(timestamp);
  return Number.isNaN(time) ? null : Math.floor((now.getTime() - time) / DAY_MS);
}

/** How recently the repository was pushed to, relative to the snapshot time. */
export function activityStatus(pushedAt: string | null | undefined, now: Date): Activity {
  const age = ageInDays(pushedAt, now);
  if (age === null) return 'unknown';
  if (age <= 30) return 'active';
  if (age <= 180) return 'maintained';
  return 'quiet';
}

/** Under a year old is emerging; older projects are established, quiet or not. */
export function maturityStatus(
  createdAt: string | null | undefined,
  activity: Activity,
  now: Date,
): Maturity {
  const age = ageInDays(createdAt, now);
  if (age === null) return 'unknown';
  if (age < 365) return 'emerging';
  return activity === 'active' || activity === 'maintained' ? 'established' : 'established-quiet';
}
