/**
 * Monthly revenue bar chart (server component, plain SVG — no client JS).
 * Current year as stacked bars (own + SUB), previous year as a grey bar
 * beside it. Values in EUR; the y-axis is auto-scaled to a "nice" step.
 */

export type RevenueChartMonth = { own: number; sub: number; prev: number | null }

function niceStep(max: number): number {
  if (max <= 0) return 1
  const raw = max / 4
  const pow = 10 ** Math.floor(Math.log10(raw))
  const n = raw / pow
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return step * pow
}

function fmtShort(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Mio`
  if (v >= 1_000) return `${Math.round(v / 1_000)} T€`
  return `${Math.round(v)} €`
}

export function RevenueChart({
  months,
  labels,
  legend,
  formatValue,
  highlightRange,
}: {
  months: RevenueChartMonth[] // 12 entries
  labels: string[] // 12 short month names
  legend: { own: string; sub: string; prev: string }
  formatValue: (v: number) => string
  /** 0-11 inclusive range: dim all months outside it. */
  highlightRange?: { from: number; to: number } | null
}) {
  const W = 960
  const H = 220
  const padL = 48
  const padR = 12
  const padT = 12
  const padB = 28
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const maxVal = Math.max(1, ...months.map((m) => Math.max(m.own + m.sub, m.prev ?? 0)))
  const step = niceStep(maxVal)
  const yMax = Math.ceil(maxVal / step) * step
  const y = (v: number) => padT + plotH - (v / yMax) * plotH

  const slot = plotW / 12
  const barW = Math.min(18, slot * 0.26)
  const gap = 3
  const ticks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-4 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-[3px] bg-accent" /> {legend.own}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-[3px] bg-accent/40" /> {legend.sub}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-[3px] bg-neutral-400/70" /> {legend.prev}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${legend.own} / ${legend.sub} / ${legend.prev}`}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={padL}
              x2={W - padR}
              y1={y(t)}
              y2={y(t)}
              className="stroke-border"
              strokeWidth={1}
              strokeDasharray={t === 0 ? undefined : '3 4'}
            />
            <text
              x={padL - 6}
              y={y(t) + 4}
              textAnchor="end"
              className="fill-muted"
              fontSize={10}
            >
              {fmtShort(t)}
            </text>
          </g>
        ))}
        {months.map((m, i) => {
          const cx = padL + slot * i + slot / 2
          const curX = cx - barW - gap / 2
          const prevX = cx + gap / 2
          const cur = m.own + m.sub
          const dim = highlightRange != null && (i < highlightRange.from || i > highlightRange.to)
          return (
            <g key={i} opacity={dim ? 0.35 : 1}>
              {m.sub > 0 && (
                <rect
                  x={curX}
                  y={y(cur)}
                  width={barW}
                  height={y(m.own) - y(cur)}
                  className="fill-accent/40 transition-opacity hover:opacity-80"
                  rx={4}
                >
                  <title>{`${labels[i]} · ${legend.sub}: ${formatValue(m.sub)}`}</title>
                </rect>
              )}
              {m.own > 0 && (
                <rect
                  x={curX}
                  y={y(m.own)}
                  width={barW}
                  height={y(0) - y(m.own)}
                  className="fill-accent transition-opacity hover:opacity-80"
                  rx={m.sub > 0 ? 0 : 4}
                >
                  <title>{`${labels[i]} · ${legend.own}: ${formatValue(m.own)}`}</title>
                </rect>
              )}
              {m.prev != null && m.prev > 0 && (
                <rect
                  x={prevX}
                  y={y(m.prev)}
                  width={barW}
                  height={y(0) - y(m.prev)}
                  className="fill-neutral-400/70 transition-opacity hover:opacity-80"
                  rx={4}
                >
                  <title>{`${labels[i]} · ${legend.prev}: ${formatValue(m.prev)}`}</title>
                </rect>
              )}
              <text
                x={cx}
                y={H - padB + 16}
                textAnchor="middle"
                className="fill-muted"
                fontSize={10}
              >
                {labels[i]}
              </text>
            </g>
          )
        })}
        <line
          x1={padL}
          x2={W - padR}
          y1={y(0)}
          y2={y(0)}
          className="stroke-border"
          strokeWidth={1}
        />
      </svg>
    </div>
  )
}
