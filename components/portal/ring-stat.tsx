/** A single circular progress ring — used for leave balances (remaining/entitled), colored per leave type. */
export function RingStat({
  label, value, valueLabel, fraction, colour, size = 96,
}: {
  label: string;
  value: string;
  valueLabel: string;
  /** 0–1, or null for "no limit" (renders a full static ring, no progress meaning). */
  fraction: number | null;
  colour: string;
  size?: number;
}) {
  const stroke = size * 0.09;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = fraction === null ? 1 : Math.max(0, Math.min(1, fraction));
  const offset = circumference * (1 - clamped);

  return (
    <div className="ring-stat">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${valueLabel}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={colour} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={fraction === null ? 0 : offset}
          opacity={fraction === null ? 0.55 : 1}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle" className="ring-stat-value">{value}</text>
        <text x="50%" y="66%" textAnchor="middle" dominantBaseline="middle" className="ring-stat-unit">days</text>
      </svg>
      <span className="ring-stat-label">{label}</span>
      <span className="ring-stat-sub">{valueLabel}</span>
    </div>
  );
}
