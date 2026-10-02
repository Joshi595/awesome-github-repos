import type { DomainSummary, Repo, Snapshot } from '@agr/schema';

export const TOP_START_MARKER = '<!-- TOP:START -->';
export const TOP_END_MARKER = '<!-- TOP:END -->';
export const STATS_START_MARKER = '<!-- STATS:START -->';
export const STATS_END_MARKER = '<!-- STATS:END -->';

const README_TOP_COUNT = 100;
const DOMAIN_LIST_COUNT = 200;
const DESCRIPTION_LIMIT = 160;

function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

/** Makes a value safe inside a Markdown table cell. */
export function escapeCell(value: string | null): string {
  return (value ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1).trimEnd()}…`;
}

export function renderRepoTable(repos: readonly Repo[]): string {
  if (repos.length === 0) return 'No repositories in this list yet.';
  const rows = [
    '| # | Repository | Stars | Language | Description |',
    '| ---: | --- | ---: | --- | --- |',
  ];
  repos.forEach((repo, index) => {
    const description = truncate(escapeCell(repo.description), DESCRIPTION_LIMIT) || '-';
    rows.push(
      `| ${index + 1} | [${escapeCell(repo.name)}](${repo.url}) | ${formatNumber(repo.stars)} | ` +
        `${escapeCell(repo.language) || '-'} | ${description} |`,
    );
  });
  return rows.join('\n');
}

/** Replaces the text between two markers, keeping the markers themselves. */
export function replaceSection(
  content: string,
  start: string,
  end: string,
  replacement: string,
): string {
  const from = content.indexOf(start);
  const to = content.indexOf(end);
  if (from === -1 || to === -1 || from >= to) {
    throw new Error(`README markers are missing or malformed: ${start}`);
  }
  return `${content.slice(0, from)}${start}\n${replacement}\n${content.slice(to)}`;
}

export function updateReadme(readme: string, snapshot: Snapshot): string {
  const date = snapshot.generated_at.slice(0, 10);
  const stats =
    `**${formatNumber(snapshot.repository_count)}** repositories with ` +
    `${formatNumber(snapshot.minimum_stars)}+ stars, as of **${date}**.`;
  const table = renderRepoTable(snapshot.repositories.slice(0, README_TOP_COUNT));
  const withStats = replaceSection(readme, STATS_START_MARKER, STATS_END_MARKER, stats);
  return replaceSection(withStats, TOP_START_MARKER, TOP_END_MARKER, table);
}

function domainList(domain: DomainSummary, snapshot: Snapshot): string {
  // A repository is listed under its primary domain only, so the lists don't repeat each other.
  const repos = snapshot.repositories.filter((repo) => repo.domains[0] === domain.id);
  const shown = repos.slice(0, DOMAIN_LIST_COUNT);
  return [
    `# ${domain.label}`,
    '',
    domain.description,
    '',
    `Top ${formatNumber(shown.length)} of ${formatNumber(repos.length)} repositories, ` +
      `as of ${snapshot.generated_at.slice(0, 10)}. Generated file: do not edit by hand.`,
    '',
    renderRepoTable(shown),
    '',
  ].join('\n');
}

/** The generated `lists/` directory: one file per domain plus an index, keyed by file name. */
export function renderDomainLists(snapshot: Snapshot): Map<string, string> {
  const files = new Map<string, string>();
  const index = [
    '# Lists by domain',
    '',
    `Generated from the ${snapshot.generated_at.slice(0, 10)} snapshot. Do not edit by hand.`,
    '',
  ];
  for (const domain of snapshot.domains) {
    files.set(`${domain.id}.md`, domainList(domain, snapshot));
    const primaryCount = snapshot.repositories.filter(
      (repo) => repo.domains[0] === domain.id,
    ).length;
    index.push(
      `- [${domain.label}](${domain.id}.md) (${formatNumber(primaryCount)}): ${domain.description}`,
    );
  }
  index.push('');
  files.set('README.md', index.join('\n'));
  return files;
}
