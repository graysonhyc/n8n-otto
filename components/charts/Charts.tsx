// Dependency-free SVG chart primitives. Hand-rolled to match the codebase's
// no-runtime-chart-lib style and to inherit theme colours via `currentColor`
// and CSS variables (so they flip with light/dark automatically).

export type Segment = { label: string; value: number; color: string };

/** Tiny inline trend line. Scales to its container; colours via `currentColor`. */
export function Sparkline({
  data,
  className = "",
  fill = true,
}: {
  data: number[];
  className?: string;
  fill?: boolean;
}) {
  const W = 100;
  const H = 28;
  const pad = 2;
  const max = Math.max(1, ...data);
  const n = data.length;
  const pts =
    n <= 1
      ? [[pad, H - pad] as const, [W - pad, H - pad] as const]
      : data.map((v, i) => [
          pad + (i / (n - 1)) * (W - pad * 2),
          H - pad - (v / max) * (H - pad * 2),
        ] as const);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${pad},${H - pad} ${line} ${W - pad},${H - pad}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className} aria-hidden>
      {fill && <polygon points={area} fill="currentColor" opacity={0.1} />}
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Ring chart with a centred total. Segments render in order. */
export function Donut({
  segments,
  size = 140,
  thickness = 15,
  centerValue,
  centerLabel,
}: {
  segments: Segment[];
  size?: number;
  thickness?: number;
  centerValue: string | number;
  centerLabel: string;
}) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let offset = 0;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-panel-3)" strokeWidth={thickness} />
        {segments.map((s) => {
          const len = (s.value / total) * c;
          const el = (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="absolute grid place-items-center text-center">
        <span className="font-mono text-[26px] font-semibold tracking-[-0.02em] nums">{centerValue}</span>
        <span className="text-[10.5px] font-semibold tracking-[0.08em] text-faint uppercase">{centerLabel}</span>
      </div>
    </div>
  );
}

/** Horizontal labelled bars, sorted by the caller. */
export function HBars({
  rows,
  valueSuffix = "",
}: {
  rows: { label: string; value: number; color?: string }[];
  valueSuffix?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[104px_1fr_auto] items-center gap-3">
          <span className="truncate text-[12.5px] text-muted" title={r.label}>
            {r.label}
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-panel-3">
            <span
              className="block h-full rounded-full"
              style={{ width: `${(r.value / max) * 100}%`, background: r.color ?? "var(--color-accent)" }}
            />
          </span>
          <span className="w-8 text-right font-mono text-[12px] font-medium text-ink nums">
            {r.value}
            {valueSuffix}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Legend row for a donut/segment set. */
export function Legend({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className="flex flex-col gap-1.5">
      {segments.map((s) => (
        <div key={s.label} className="flex items-center gap-2 text-[12.5px]">
          <span className="h-2.5 w-2.5 flex-none rounded-[3px]" style={{ background: s.color }} />
          <span className="text-muted">{s.label}</span>
          <span className="ml-auto font-mono text-ink nums">{s.value}</span>
          <span className="w-9 text-right font-mono text-faint nums">
            {Math.round((s.value / total) * 100)}%
          </span>
        </div>
      ))}
    </div>
  );
}
