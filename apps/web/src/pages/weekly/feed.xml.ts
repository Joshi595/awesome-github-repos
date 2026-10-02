import type { APIRoute } from 'astro';
import { getSnapshot } from '../../lib/data';
import { href, weekPath } from '../../lib/paths';
import { weekBasis, weekSummary, weekTitle } from '../../lib/weekly';

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => `&#${character.charCodeAt(0)};`);
}

/** An RSS feed with one entry per finished weekly report. */
export const GET: APIRoute = ({ site }) => {
  const absolute = (path: string) => new URL(path, site).href;
  const items = getSnapshot()
    // A week still in progress changes daily; feed readers should only get it once it is final.
    .weekly.filter((report) => report.final)
    .map(
      (report) => `    <item>
      <title>${escapeXml(`${weekTitle(report)}: top GitHub repositories`)}</title>
      <link>${escapeXml(absolute(weekPath(report.week)))}</link>
      <guid isPermaLink="true">${escapeXml(absolute(weekPath(report.week)))}</guid>
      <pubDate>${new Date(`${report.to}T12:00:00Z`).toUTCString()}</pubDate>
      <description>${escapeXml(`${weekSummary(report)} ${weekBasis(report)}`)}</description>
    </item>`,
    );

  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>awesome/repos weekly</title>
    <link>${escapeXml(absolute(href('/weekly/')))}</link>
    <description>What changed each week among GitHub repositories with 10,000+ stars.</description>
    <language>en</language>
${items.join('\n')}
  </channel>
</rss>
`;
  return new Response(feed, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
