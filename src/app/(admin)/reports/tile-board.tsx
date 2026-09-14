'use client'

/**
 * The Heute tiles, each opening what stands behind it right under the tiles.
 *
 * A tile used to be a link to another tab or to a list further down the page.
 * Now a click opens a sheet under the tiles with everything that tile counts —
 * the lines of this month, the jobs that are late, who is out today — and a
 * link to the full view. One sheet at a time; a second click on the same tile
 * closes it again.
 *
 * The sheet opens under the whole grid, not under the tile's own row, so no tile
 * ever moves when one is opened. The open tile is marked, and the sheet repeats
 * its name, so the two read as one.
 *
 * Which tile is open lives in the address (`?open=`) and nowhere else: a link —
 * the old offers tab, the dashboard — opens one, a reload keeps it, and moving
 * around inside the app can never leave a sheet open that the address does not
 * name. It is written without a round trip; Next keeps `useSearchParams` in step
 * with `history.replaceState`.
 */

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

export type TileLamp = 'green' | 'yellow' | 'red' | 'none'

export type BoardTile = {
  key: string
  label: string
  value: string
  caption: string | null
  lamp: TileLamp
  /** What the sheet under the tiles shows, drawn on the server. */
  panel: ReactNode
  /** Where the full view is. */
  more: { href: string; label: string } | null
}

const LAMP: Record<TileLamp, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-red-500',
  none: 'bg-border',
}

const PANEL_ID = 'today-tile-panel'

export function TileBoard({ tiles, closeLabel }: { tiles: BoardTile[]; closeLabel: string }) {
  const searchParams = useSearchParams()
  const asked = searchParams.get('open')
  const open = tiles.find((tile) => tile.key === asked) ?? null
  const buttons = useRef(new Map<string, HTMLButtonElement>())

  const choose = (key: string | null) => {
    const params = new URLSearchParams(window.location.search)
    if (key) params.set('open', key)
    else params.delete('open')
    const query = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
  }

  /** Closing from the sheet's own button hands the keyboard back to the tile that opened it. */
  const close = () => {
    const key = open?.key
    choose(null)
    if (key) buttons.current.get(key)?.focus()
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((tile) => {
          const active = tile.key === open?.key
          return (
            <button
              key={tile.key}
              ref={(node) => {
                if (node) buttons.current.set(tile.key, node)
                else buttons.current.delete(tile.key)
              }}
              type="button"
              aria-expanded={active}
              aria-controls={PANEL_ID}
              onClick={() => choose(active ? null : tile.key)}
              // A button centres its contents in the height the grid row gives
              // it; as a column they stay at the top, level with the tiles beside.
              className={`flex flex-col justify-start rounded-xl border px-3 py-2.5 text-left shadow-sm transition-colors ${
                active ? 'border-accent bg-accent/5' : 'border-border bg-surface hover:bg-surface-hover'
              }`}
            >
              <span className="flex w-full items-start justify-between gap-2">
                <span className="text-[11px] uppercase tracking-wide text-muted">{tile.label}</span>
                <span aria-hidden className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${LAMP[tile.lamp]}`} />
              </span>
              <span className="mt-0.5 block text-lg font-semibold tabular-nums">{tile.value}</span>
              <span className="mt-0.5 block text-[11px] text-muted">{tile.caption ?? ''}</span>
            </button>
          )
        })}
      </div>

      {open && (
        <section
          id={PANEL_ID}
          aria-label={open.label}
          className="overflow-hidden rounded-xl border border-accent/40 bg-surface shadow-sm"
        >
          <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
            <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{open.label}</h2>
            {open.more && (
              <Link href={open.more.href} className="shrink-0 text-xs text-accent hover:underline">
                {open.more.label} →
              </Link>
            )}
            <button
              type="button"
              onClick={close}
              aria-label={closeLabel}
              title={closeLabel}
              className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <div className="p-4">{open.panel}</div>
        </section>
      )}
    </div>
  )
}
