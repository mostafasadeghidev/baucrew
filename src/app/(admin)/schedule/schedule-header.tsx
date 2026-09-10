/**
 * The header every scheduling view wears: the three views on one line, the
 * period and its controls on the next.
 *
 * It exists because it kept moving. The three headers were hand-copied, and
 * the right-hand group was flush right with `justify-between`, so anything
 * that changed width in that group slid everything beside it: the weekend
 * toggle vanished entirely on a week that already had a Saturday assignment
 * (about 133px of sideways jump on every screen), the toggle's own label grew
 * by 69px when it was switched on, and between roughly 890 and 1020 pixels the
 * whole thing wrapped to two or three rows and pushed the board 40 to 80
 * pixels down the page. Paging from one week to the next moved the day a
 * person was reading out from under their eyes.
 *
 * Five rules keep it still, and every one of them is load-bearing:
 *
 *   1. Two rows, each `min-h-9`. The number of rows is a constant, not a
 *      consequence of how wide the screen is.
 *   2. Neither row wraps; a narrow screen scrolls one sideways instead.
 *   3. No control appears or disappears with the data. A weekend toggle that
 *      cannot be switched off is shown switched on and locked, not removed.
 *      What "locked" looks like is settled at the switch itself, below.
 *   4. A toggle's label never changes with its state — on and off are told
 *      apart by the switch beside it. A word that grows when clicked drags its
 *      neighbours along with it. The switch also says at a glance that these
 *      two are settings rather than places to go, which they did not while
 *      they wore the same bordered box as the arrows next to them.
 *   5. The stepper closes the second row, hard against the right edge and so
 *      directly under the view switcher, with every toggle queued to its left.
 *      Nothing stands to its right, so nothing can move it: in the month,
 *      which has no toggles at all, the arrows are in the same place as in the
 *      week, which has two. The word between them is the same in all three
 *      views for the same reason — "Aktuelle Woche", "Aktueller Monat" and
 *      "Heute" are three different widths.
 */

import Link from 'next/link'
import { btn } from '@/components/ui/button'
import { pageTitle } from '@/components/ui/page-panel'

export type ScheduleView = 'week' | 'month' | 'map'

export type ScheduleHeaderToggle = {
  /** Where it goes; null when it is on and cannot be switched off. */
  href: string | null
  label: string
  active: boolean
  /** The sentence behind the hover, e.g. why it cannot be switched off. */
  title?: string
}

export function ScheduleHeader({
  title,
  view,
  weekHref,
  monthHref,
  mapHref,
  viewLabels,
  periodLabel,
  prevHref,
  nextHref,
  currentHref,
  currentLabel,
  prevLabel,
  nextLabel,
  toggles = [],
}: {
  /** The page's own name; on screen only where the sidebar is folded away. */
  title: string
  view: ScheduleView
  weekHref: string
  monthHref: string
  mapHref: string
  viewLabels: { week: string; month: string; map: string }
  /** "KW 37", "September 2026" — whatever the view is standing on. */
  periodLabel: string
  prevHref: string
  nextHref: string
  currentHref: string
  currentLabel: string
  prevLabel: string
  nextLabel: string
  /**
   * Read outwards from the stepper: the first one sits next to the arrows, the
   * next one beyond it. They are drawn in reverse so that reading the row from
   * its right edge gives the arrows, then this list in order.
   */
  toggles?: ScheduleHeaderToggle[]
}) {
  const views: Array<{ key: ScheduleView; href: string; label: string }> = [
    { key: 'week', href: weekHref, label: viewLabels.week },
    { key: 'month', href: monthHref, label: viewLabels.month },
    { key: 'map', href: mapHref, label: viewLabels.map },
  ]
  const tab = 'rounded-md px-3 py-1 text-muted transition-colors hover:text-foreground'

  return (
    // The two rows sit on a sheet of their own, the same sheet the board under
    // them wears. The rules above are about what may move inside it; the sheet
    // itself has a fixed padding, so it cannot move either.
    <div className="space-y-2 rounded-xl border border-border bg-surface px-4 py-3 shadow-sm print:rounded-none print:border-0 print:px-0 print:shadow-none">
      <div className="flex min-h-9 items-center justify-between gap-3">
        <h1 className={pageTitle}>{title}</h1>
        <span className="truncate text-lg font-medium text-muted">{periodLabel}</span>
        <div className="ml-auto flex items-center gap-1 overflow-x-auto rounded-lg bg-subtle p-1 text-sm font-medium">
          {views.map((v) =>
            v.key === view ? (
              <span
                key={v.key}
                aria-current="page"
                className="whitespace-nowrap rounded-md bg-surface px-3 py-1 text-foreground shadow-sm"
              >
                {v.label}
              </span>
            ) : (
              <Link key={v.key} href={v.href} className={`${tab} whitespace-nowrap`}>
                {v.label}
              </Link>
            )
          )}
        </div>
      </div>

      {/* The stepper closes this row, right under the switcher above it, and
          the toggles queue to its left — so nothing that comes and goes can
          move the arrows a person is aiming at. */}
      <div className="flex min-h-9 items-center justify-end gap-2 overflow-x-auto">
        <div className="ml-auto flex items-center gap-2">
          {[...toggles].reverse().map((toggle) => {
            const locked = toggle.href === null
            // Same words, same width, whichever way it stands.
            const look = `inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              locked ? 'text-foreground opacity-50' : toggle.active ? 'text-foreground' : 'text-muted'
            }`
            // A switch that is on but cannot be moved keeps the colour of a
            // switch that is on — same accent track, same knob on the right —
            // and only fades. Draining the colour out made it read as off,
            // which is the one thing it is not; halving it reads as "on, and
            // not yours to change", which is what it is.
            const knob = (
              <span
                aria-hidden
                className={`inline-flex h-3.5 w-6 shrink-0 items-center rounded-full border transition-colors ${
                  toggle.active ? 'border-accent bg-accent' : 'border-border bg-subtle'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    toggle.active ? 'ml-auto mr-0.5 bg-white' : 'ml-0.5 bg-muted'
                  }`}
                />
              </span>
            )
            return toggle.href === null ? (
              <span
                key={toggle.label}
                title={toggle.title}
                role="switch"
                aria-checked
                aria-disabled
                className={`${look} cursor-not-allowed`}
              >
                {knob}
                {toggle.label}
              </span>
            ) : (
              <Link
                key={toggle.label}
                href={toggle.href}
                title={toggle.title}
                role="switch"
                aria-checked={toggle.active}
                // Not `surface-hover`: in the light theme that token is the
                // very colour of the page these toggles sit on, so hovering an
                // switched-on toggle painted it its own background and nothing
                // moved. The accent is a tint of the switch beside it.
                className={`${look} hover:bg-accent/10 hover:text-foreground`}
              >
                {knob}
                {toggle.label}
              </Link>
            )
          })}
          <div className="flex items-center gap-1">
            <Link href={prevHref} className={btn.outlineXs} aria-label={prevLabel} title={prevLabel}>
              ←
            </Link>
            <Link href={currentHref} className={`${btn.outlineXs} whitespace-nowrap`}>
              {currentLabel}
            </Link>
            <Link href={nextHref} className={btn.outlineXs} aria-label={nextLabel} title={nextLabel}>
              →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
