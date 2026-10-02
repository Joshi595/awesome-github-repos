import { useState } from 'preact/hooks';
import { dayNumber, niceTicks, type Series } from '../../lib/chart';
import { formatCompact, formatDate, formatNumber } from '../../lib/format';

interface Props {
  /** `YYYY-MM-DD`, oldest first. */
  dates: string[];
  /** At most four; each line takes the next colour slot in order. */
  series: Series[];
  /** What the numbers are, for the accessible name and the table: "Stars", "Stars gained". */
  measure: string;
  /** Prefix non-zero values with a sign, for gains. */
  signed?: boolean;
  height?: number;
}

const WIDTH = 640;
const MARGIN = { top: 14, right: 16, bottom: 28, left: 52 };
/** Room on the right for a name beside each line's end when several are drawn. */
const END_LABEL_WIDTH = 150;
/** End labels closer together than this, vertically, would overlap. */
const END_LABEL_GAP = 16;
const MAX_SERIES = 4;
const MAX_X_LABELS = 6;

/**
 * A line chart of stars over time, with a crosshair tooltip and a table view.
 * It also works unhydrated: the lines, axes and table are plain markup.
 */
export function TrendChart({
  dates,
  series: allSeries,
  measure,
  signed = false,
  height = 220,
}: Props) {
  const [active, setActive] = useState<number | null>(null);
  const series = allSeries.slice(0, MAX_SERIES);
  const several = series.length > 1;
  const values = series.flatMap((item) =>
    item.values.filter((value): value is number => value !== null),
  );
  if (dates.length < 2 || values.length < 2) return null;

  const format = (value: number, compact = false) => {
    const text = compact ? formatCompact(Math.abs(value)) : formatNumber(Math.abs(value));
    if (value < 0) return `-${text}`;
    return signed && value > 0 ? `+${text}` : text;
  };

  const plotHeight = height - MARGIN.top - MARGIN.bottom;
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const low = ticks[0] ?? 0;
  const high = ticks.at(-1) ?? 1;
  const y = (value: number) => MARGIN.top + (1 - (value - low) / (high - low)) * plotHeight;

  // Name each line at its end only when the names have room. Lines that finish close
  // together would stack their labels, so then the legend and tooltip carry identity alone.
  const ends = series
    .flatMap((item) => item.values.findLast((value) => value !== null) ?? [])
    .map(y)
    .sort((a, b) => a - b);
  const labelEnds =
    several &&
    ends.every((end, index) => index === 0 || end - (ends[index - 1] ?? 0) >= END_LABEL_GAP);
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right - (labelEnds ? END_LABEL_WIDTH : 0);
  const days = dates.map(dayNumber);
  const firstDay = days[0] ?? 0;
  const span = (days.at(-1) ?? 1) - firstDay || 1;
  const x = (index: number) =>
    MARGIN.left + (((days[index] ?? firstDay) - firstDay) / span) * plotWidth;

  // Label the first and last dates always; thin the ones between so they never collide.
  const stride = Math.max(1, Math.ceil(dates.length / MAX_X_LABELS));
  const labelled = dates.map((_, index) => index === dates.length - 1 || index % stride === 0);

  const lines = series.map((item) => {
    const points = item.values.flatMap((value, index) =>
      value === null ? [] : [{ index, x: x(index), y: y(value), value }],
    );
    return { label: item.label, points, last: points.at(-1) };
  });

  const nearest = (clientX: number, svg: SVGSVGElement) => {
    const box = svg.getBoundingClientRect();
    const target = ((clientX - box.left) / box.width) * WIDTH;
    let best = 0;
    dates.forEach((_, index) => {
      if (Math.abs(x(index) - target) < Math.abs(x(best) - target)) best = index;
    });
    return best;
  };
  const step = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const current = active ?? dates.length - 1;
    setActive(
      Math.min(dates.length - 1, Math.max(0, current + (event.key === 'ArrowRight' ? 1 : -1))),
    );
  };

  const summary = lines.map((line) => `${line.label}: ${format(line.last?.value ?? 0)}`).join('; ');

  return (
    <figure class="chart">
      {several && (
        <ul class="chart-legend">
          {series.map((item, index) => (
            <li key={item.label}>
              <i class={`chart-key series-${index + 1}`} />
              {item.label}
            </li>
          ))}
        </ul>
      )}

      <div class="chart-plot">
        <svg
          viewBox={`0 0 ${WIDTH} ${height}`}
          role="img"
          tabIndex={0}
          aria-label={`${measure} from ${formatDate(dates[0] ?? '')} to ${formatDate(dates.at(-1) ?? '')}. ${summary}. Use the left and right arrow keys to read each date.`}
          onPointerMove={(event) => setActive(nearest(event.clientX, event.currentTarget))}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(active ?? dates.length - 1)}
          onBlur={() => setActive(null)}
          onKeyDown={step}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                class="chart-grid"
                x1={MARGIN.left}
                x2={MARGIN.left + plotWidth}
                y1={y(tick)}
                y2={y(tick)}
              />
              <text
                class="chart-tick"
                x={MARGIN.left - 8}
                y={y(tick)}
                text-anchor="end"
                dominant-baseline="middle"
              >
                {format(tick, true)}
              </text>
            </g>
          ))}
          {dates.map(
            (date, index) =>
              labelled[index] && (
                <text
                  key={date}
                  class="chart-tick"
                  x={x(index)}
                  y={height - 8}
                  text-anchor={
                    index === 0 ? 'start' : index === dates.length - 1 ? 'end' : 'middle'
                  }
                >
                  {formatDate(date).replace(/, \d{4}$/, '')}
                </text>
              ),
          )}

          {active !== null && (
            <line
              class="chart-crosshair"
              x1={x(active)}
              x2={x(active)}
              y1={MARGIN.top}
              y2={MARGIN.top + plotHeight}
            />
          )}

          {lines.map((line, index) => (
            <g key={line.label} class={`series-${index + 1}`}>
              <polyline
                class="chart-line"
                points={line.points
                  .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
                  .join(' ')}
              />
              {line.last && <circle class="chart-dot" cx={line.last.x} cy={line.last.y} r="4" />}
              {active !== null &&
                line.points
                  .filter((point) => point.index === active && point !== line.last)
                  .map((point) => <circle class="chart-dot" cx={point.x} cy={point.y} r="4" />)}
              {labelEnds && line.last && (
                <text
                  class="chart-end-label"
                  x={line.last.x + 10}
                  y={line.last.y}
                  dominant-baseline="middle"
                >
                  {line.label.length > 22 ? `${line.label.slice(0, 21)}…` : line.label}
                </text>
              )}
            </g>
          ))}
        </svg>

        {active !== null && (
          <div
            class={`chart-tooltip ${x(active) > WIDTH / 2 ? 'is-left' : ''}`}
            style={{ left: `${(x(active) / WIDTH) * 100}%` }}
            role="status"
          >
            <p class="chart-tooltip-date">{formatDate(dates[active] ?? '')}</p>
            {series.map((item, index) => {
              const value = item.values[active];
              return (
                <p key={item.label}>
                  <i class={`chart-key series-${index + 1}`} />
                  <strong>{value === null || value === undefined ? 'n/a' : format(value)}</strong>
                  {several && <span>{item.label}</span>}
                </p>
              );
            })}
          </div>
        )}
      </div>

      <details class="chart-table">
        <summary>View as table</summary>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Date</th>
                {series.map((item) => (
                  <th scope="col" key={item.label}>
                    {several ? item.label : measure}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dates.map((date, index) => (
                <tr key={date}>
                  <th scope="row">{formatDate(date)}</th>
                  {series.map((item) => {
                    const value = item.values[index];
                    return (
                      <td key={item.label}>
                        {value === null || value === undefined ? 'n/a' : format(value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
