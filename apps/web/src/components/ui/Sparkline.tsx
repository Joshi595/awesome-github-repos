import { formatNumber } from '../../lib/format';

interface Props {
  /** Star counts, oldest first. Nothing is drawn for fewer than two points. */
  values: readonly number[];
  width?: number;
  height?: number;
}

/** A small line of a repository's star history. */
export function Sparkline({ values, width = 132, height = 36 }: Props) {
  const first = values[0];
  const last = values.at(-1);
  if (values.length < 2 || first === undefined || last === undefined) return null;

  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const pad = 2;
  const points = values.map((value, index) => {
    const x = pad + (index / (values.length - 1)) * (width - pad * 2);
    const y = height - pad - ((value - min) / span) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const end = points.at(-1)?.split(',') ?? ['0', '0'];

  return (
    <svg
      class="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={`Stars over ${values.length} snapshots: ${formatNumber(first)} to ${formatNumber(last)}`}
    >
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linejoin="round"
      />
      <circle cx={end[0]} cy={end[1]} r="2.2" fill="currentColor" />
    </svg>
  );
}
