/**
 * Quarterly donut (server component, plain SVG — no client JS). Four segments
 * around a ring with the total in the middle — a compact alternative to yet
 * another table.
 */

export type DonutSlice = { label: string; value: number; hint?: string }

const COLORS = ['var(--accent)', 'color-mix(in srgb, var(--accent) 65%, white)', 'color-mix(in srgb, var(--accent) 40%, white)', 'color-mix(in srgb, var(--accent) 22%, white)']

export function DonutChart({
  slices,
  centerLabel,
  centerValue,
  formatValue,
}: {
  slices: DonutSlice[]
  centerLabel: string
  centerValue: string
  formatValue: (value: number) => string
}) {
  const total = slices.reduce((sum, s) => sum + Math.max(0, s.value), 0)
  const size = 200
  const stroke = 26
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius

  let offset = 0
  const arcs = slices.map((s, i) => {
    const value = Math.max(0, s.value)
    const share = total > 0 ? value / total : 0
    const arc = {
      key: s.label,
      color: COLORS[i % COLORS.length],
      dash: `${share * circumference} ${circumference}`,
      offset: -offset * circumference,
      share,
    }
    offset += share
    return arc
  })

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-44 w-44 shrink-0" role="img" aria-label={centerLabel}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--subtle)"
            strokeWidth={stroke}
          />
          {total > 0 &&
            arcs.map((a) => (
              <circle
                key={a.key}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={a.color}
                strokeWidth={stroke}
                strokeDasharray={a.dash}
                strokeDashoffset={a.offset}
              />
            ))}
        </g>
        <text
          x="50%"
          y="47%"
          textAnchor="middle"
          className="fill-[var(--foreground)] text-[15px] font-semibold"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {centerValue}
        </text>
        <text x="50%" y="60%" textAnchor="middle" className="fill-[var(--muted)] text-[10px]">
          {centerLabel}
        </text>
      </svg>

      <ul className="min-w-40 flex-1 space-y-1.5 text-sm">
        {slices.map((s, i) => (
          <li key={s.label} className="flex items-baseline justify-between gap-3">
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: COLORS[i % COLORS.length] }}
              />
              {s.label}
              {s.hint && <span className="text-xs text-muted">{s.hint}</span>}
            </span>
            <span className="tabular-nums font-medium">{formatValue(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Thin bar used inside table rows (utilization, customer share). */
export function MiniBar({ share, tone = 'accent' }: { share: number; tone?: 'accent' | 'warn' | 'ok' }) {
  const width = Math.max(0, Math.min(1, share)) * 100
  const color =
    tone === 'warn'
      ? 'bg-amber-500/70'
      : tone === 'ok'
        ? 'bg-emerald-500/70'
        : 'bg-accent/70'
  return (
    <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-subtle" aria-hidden>
      <span className={`block h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
    </span>
  )
}
