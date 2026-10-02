import type { APIRoute } from 'astro';
import { getSnapshot } from '../../lib/data';

/** The full snapshot, published so `npm run data:pull` can reuse it for local development. */
export const GET: APIRoute = () =>
  new Response(JSON.stringify(getSnapshot()), { headers: { 'Content-Type': 'application/json' } });
