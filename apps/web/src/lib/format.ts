const DAY_MS = 86_400_000;
const number = new Intl.NumberFormat('en-US');
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });

export function formatNumber(value: number): string {
  return number.format(value);
}

/** 12,345 -> "12.3K". */
export function formatCompact(value: number): string {
  return compact.format(value);
}

/** A change with an explicit sign: "+1.2K", "-40", "0". */
export function formatSigned(value: number): string {
  if (value === 0) return '0';
  return `${value > 0 ? '+' : '-'}${formatCompact(Math.abs(value))}`;
}

export function formatDate(value: string | number): string {
  return date.format(new Date(value));
}

/**
 * How long before `now` something happened. `now` is the snapshot time rather
 * than the visitor's clock, so the text matches the data and renders the same
 * on the server and in the browser.
 */
export function formatAge(time: number | null, now: number): string {
  if (time === null) return 'unknown';
  const days = Math.max(0, Math.floor((now - time) / DAY_MS));
  if (days === 0) return 'today';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** Age as a duration: "8mo", "11y". */
export function formatDuration(time: number | null, now: number): string {
  if (time === null) return 'unknown';
  const days = Math.max(0, Math.floor((now - time) / DAY_MS));
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

const ACTIVITY_LABELS: Record<string, string> = {
  active: 'Active',
  maintained: 'Maintained',
  quiet: 'Quiet',
  unknown: 'Activity unknown',
};

export function activityLabel(activity: string): string {
  return ACTIVITY_LABELS[activity] ?? activity;
}

// GitHub's linguist colours for the languages that appear most often.
const LANGUAGE_COLORS: Record<string, string> = {
  Python: '#3572A5',
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Go: '#00ADD8',
  Rust: '#dea584',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#8a8a8a',
  'C#': '#178600',
  PHP: '#4F5D95',
  Ruby: '#701516',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Shell: '#89e051',
  HTML: '#e34c26',
  CSS: '#663399',
  'Jupyter Notebook': '#DA5B0B',
  Dart: '#00B4AB',
  Vue: '#41b883',
  Lua: '#5b5bd6',
  'Objective-C': '#438eff',
  Scala: '#c22d40',
  Zig: '#ec915c',
  Elixir: '#6e4a7e',
  Haskell: '#5e5086',
  Svelte: '#ff3e00',
  'Vim Script': '#199f4b',
  TeX: '#3D6117',
  MDX: '#fcb32c',
  PowerShell: '#2f6bb0',
  Markdown: '#2f6bb0',
  SCSS: '#c6538c',
  Nix: '#7e7eff',
  Julia: '#a270ba',
};

export function languageColor(language: string | null): string {
  return (language && LANGUAGE_COLORS[language]) || 'var(--text-3)';
}
