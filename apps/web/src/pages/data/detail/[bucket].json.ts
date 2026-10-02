import type { APIRoute, GetStaticPaths } from 'astro';
import { DETAIL_BUCKET_COUNT } from '@agr/schema';
import { getDetailBuckets } from '../../../lib/data';

export const getStaticPaths: GetStaticPaths = () =>
  Array.from({ length: DETAIL_BUCKET_COUNT }, (_, bucket) => ({ params: { bucket: String(bucket) } }));

/** One slice of the per-repository details the drawer loads on demand. */
export const GET: APIRoute = ({ params }) =>
  new Response(JSON.stringify(getDetailBuckets()[Number(params.bucket)] ?? {}), {
    headers: { 'Content-Type': 'application/json' },
  });
