/**
 * The scheduling views' bar, and the controls under it.
 *
 * The bar is the bar every other page wears — the page's name on the left, the
 * thing you come here to do on the right — at the same height, so going from
 * Projekte to Einsatzplanung does not move the top of the page. It used to
 * carry the views, the arrows and the toggles as well, which made it the one
 * bar in the app twice as tall as all the others.
 *
 * Those controls now open the sheet below it, in two rows: what the week has
 * to say and the view switcher on the first, the toggles and the arrows under
 * the switcher on the second. They change what the sheet shows, not what the
 * page is, so they belong to the sheet. The rules that stopped the old header
 * moving under the cursor all still hold:
 *
 *   1. Two rows, each `h-9`. The number of rows is a constant, not a
 *      consequence of the screen's width; a narrow screen scrolls a row
 *      sideways rather than wrapping it.
 *   2. No control appears or disappears with the data. A weekend toggle that
 *      cannot be switched off is shown on and locked, not removed.
 *   3. A toggle's label never changes with its state — the switch beside it
 *      says on or off. A word that grows when clicked drags its neighbours.
 *   4. The arrows close the second row, hard against the right edge and so
 *      directly under the switcher, with every toggle queued to their left.
 *      Nothing stands to their right, so nothing can move them: in the month,
 *      which has no toggles at all, they are where they are in the week, which
 *      has two. The word between them is the same in all three views for the
 *      same reason — "Aktuelle Woche", "Aktueller Monat" and "Heute" were three
 *      different widths.
 *   5. What the week has to say — conflicts, weather — sits in a box of fixed
 *      width. Stretched across the row it read as a banner with two words in
 *      it; at a fixed width it reads as the counter it is, and a busy week
 *      scrolls inside it rather than pushing anything along.
 */

import type { ReactNode } from 'react'
import Link from 'next/link'
import { btn } from '@/components/ui/button'
import { PageBar, StickyHead } from '@/components/ui/page-panel'

export type ScheduleView = 'week' | 'month' | 'map'

export type ScheduleHeaderToggle = {
  /** Where it goes; null when it is on and cannot be switched off. */
  href: string | null
  label: string
  active: boolean
  /** The sentence behind the hover, e.g. why it cannot be switched off. */
  title?: string
}

/** The width of the box that says what the week has to say. */
export const scheduleStatusBox =
  'flex h-9 w-80 max-w-full shrink-0 items-center gap-2 overflow-x-auto rounded-md border border-border bg-subtle px-2.5 text-xs'

export function ScheduleHeader({
  title,
  action,
}: {
  title: string
  /** The page's own button: planning a new assignment. */
  action?: ReactNode
}) {
  // No period beside the name. The week says which week it is right above
  // its days, and the month and the map say it on the first row of their
  // sheet; a second copy up here was one more thing to read, and it made the
  // bar's contents change width with the length of a month's name.
  return (
    <StickyHead>
      <PageBar title={title} actions={action} />
    </StickyHead>
  )
}

export function ScheduleControls({
  view,
  weekHref,
  monthHref,
  mapHref,
  viewLabels,
  prevHref,
  nextHref,
  currentHref,
  currentLabel,
  prevLabel,
  nextLabel,
  toggles = [],
  children,
}: {
  view: ScheduleView
  weekHref: string
  monthHref: string
  mapHref: string
  viewLabels: { week: string; month: string; map: string }
  prevHref: string
  nextHref: string
  currentHref: string
  currentLabel: string
  prevLabel: string
  nextLabel: string
  /**
   * Read outwards from the arrows: the first one sits next to them, the next
   * one beyond it. They are drawn in reverse so that reading the row from its
   * right edge gives the arrows, then this list in order.
   */
  toggles?: ScheduleHeaderToggle[]
  /** What the period has to say, at the left of the first row. */
  children?: ReactNode
}) {
  const views: Array<{ key: ScheduleView; href: string; label: string }> = [
    { key: 'week', href: weekHref, label: viewLabels.week },
    { key: 'month', href: monthHref, label: viewLabels.month },
    { key: 'map', href: mapHref, label: viewLabels.map },
  ]
  const tab = 'rounded-md px-3 py-1 text-muted transition-colors hover:text-foreground'

  return (
    <div className="shrink-0 space-y-2">
      <div className="flex h-9 items-center gap-3 overflow-x-auto">
        <div className="flex h-full min-w-0 flex-1 items-center">{children}</div>
        <div className="flex shrink-0 items-center gap-1 rounded-lg bg-subtle p-1 text-sm font-medium">
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

      {/* The arrows close this row, right under the switcher above them, and
          the toggles queue to their left — so nothing that comes and goes can
          move the arrows a person is aiming at. */}
      <div className="flex h-9 items-center justify-end gap-2 overflow-x-auto">
        {[...toggles].reverse().map((toggle) => {
          const locked = toggle.href === null
          // Same words, same width, whichever way it stands.
          const look = `inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium transition-colors ${
            locked ? 'text-foreground opacity-50' : toggle.active ? 'text-foreground' : 'text-muted'
          }`
          // A switch that is on but cannot be moved keeps the colour of a
          // switch that is on — same accent track, same knob on the right — and
          // only fades. Draining the colour out made it read as off, which is
          // the one thing it is not; halving it reads as "on, and not yours to
          // change", which is what it is.
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
          return locked ? (
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
              href={toggle.href!}
              title={toggle.title}
              role="switch"
              aria-checked={toggle.active}
              // Not `surface-hover`: in the light theme that token is the very
              // colour of the sheet these toggles sit on, so hovering a
              // switched-on toggle painted it its own background and nothing
              // moved. The accent is a tint of the switch beside it.
              className={`${look} hover:bg-accent/10 hover:text-foreground`}
            >
              {knob}
              {toggle.label}
            </Link>
          )
        })}

        <div className="flex shrink-0 items-center gap-1">
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
  )
}
