import type { APIRoute } from 'astro';
import { getSiteIndex } from '../../lib/data';

/** The compact dataset the explorer downloads. */
export const GET: APIRoute = () =>
  new Response(JSON.stringify(getSiteIndex()), { headers: { 'Content-Type': 'application/json' } });
