/**
 * Static, server-rendered horizontal bar charts for the Reports pages.
 *
 * Hand-rolled rather than a charting library — the app has no client-side
 * chart dependency, and these are non-interactive magnitude/composition
 * views, not plots someone pans or zooms. Every bar carries its value as
 * visible text (never color alone), so nothing here depends on a reader
 * distinguishing hues.
 */

export type BarItem = {
  key: string;
  label: string;
  value: number;
  formattedValue: string;
  /** Index-driven severity tone (0 = mildest .. 4 = most severe). Omit for the default gold fill. */
  severity?: 0 | 1 | 2 | 3 | 4;
};

/**
 * Sequential magnitude comparison — one hue, longest bar first unless the
 * caller has already ordered rows. `max` defaults to the largest value
 * present; pass a fixed one (e.g. 100 for a percentage-of-target series) so
 * bars stay readable against a meaningful ceiling rather than each other —
 * otherwise one over-target row silently compresses everyone else's bar.
 */
export function BarChart({ items, ariaLabel, max: maxProp }: { items: BarItem[]; ariaLabel: string; max?: number }) {
  const max = maxProp ?? Math.max(1, ...items.map((item) => item.value));
  return (
    <div className="chart-bars" role="img" aria-label={ariaLabel}>
      {items.map((item) => (
        <div className="chart-bar-row" key={item.key}>
          <span className="chart-bar-label" title={item.label}>{item.label}</span>
          <div className="chart-bar-track">
            <span
              className={`chart-bar-fill${item.severity !== undefined ? ` chart-bar-fill--severity-${item.severity}` : ""}`}
              style={{ width: `${Math.min(100, Math.round((item.value / max) * 100))}%` }}
            />
          </div>
          <span className="chart-bar-value">{item.formattedValue}</span>
        </div>
      ))}
    </div>
  );
}

export type SplitBarRow = {
  key: string;
  label: string;
  primary: number;
  context: number;
  primaryFormatted: string;
  contextFormatted: string;
};

/**
 * "Emphasis" form: one named series is the point (gold), the rest is context
 * (gray). Pairing a hue against a neutral rather than a second hue sidesteps
 * colorblind-safe categorical pairing entirely — gray has no hue to confuse.
 */
export function SplitBarChart({
  rows, primaryLabel, contextLabel,
}: {
  rows: SplitBarRow[];
  primaryLabel: string;
  contextLabel: string;
}) {
  return (
    <div className="chart-bars">
      <div className="chart-legend">
        <span className="chart-legend-item"><span className="chart-legend-swatch chart-legend-swatch--primary" />{primaryLabel}</span>
        <span className="chart-legend-item"><span className="chart-legend-swatch chart-legend-swatch--context" />{contextLabel}</span>
      </div>
      {rows.map((row) => {
        const total = Math.max(1, row.primary + row.context);
        return (
          <div className="chart-bar-row" key={row.key}>
            <span className="chart-bar-label" title={row.label}>{row.label}</span>
            <div
              className="chart-split-track"
              role="img"
              aria-label={`${row.label}: ${row.primaryFormatted} ${primaryLabel}, ${row.contextFormatted} ${contextLabel}`}
            >
              {row.primary > 0 && <span className="chart-split-fill chart-split-fill--primary" style={{ width: `${(row.primary / total) * 100}%` }} />}
              {row.context > 0 && <span className="chart-split-fill chart-split-fill--context" style={{ width: `${(row.context / total) * 100}%` }} />}
            </div>
            <span className="chart-bar-value">{row.primaryFormatted}</span>
          </div>
        );
      })}
    </div>
  );
}
