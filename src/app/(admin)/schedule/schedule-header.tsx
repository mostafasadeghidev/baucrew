/**
 * The scheduling views' head, and the row of controls under it.
 *
 * The head is the head every other page wears — the page's name on the left,
 * the thing you come here to do on the right — and between them, as pills, the
 * three ways of looking at the plan: week, month, map — all in one row. They
 * are the page's navigation, so they stand in its head like the tabs on
 * Auswertungen, and not in a box of their own inside the sheet.
 *
 * The controls row under the head keeps the rules that stopped the old
 * header moving under the cursor:
 *
 *   1. One row, `h-9`. A narrow screen scrolls it sideways rather than
 *      wrapping it.
 *   2. No control appears or disappears with the data. A weekend toggle that
 *      cannot be switched off is shown on and locked, not removed.
 *   3. A toggle's label never changes with its state — the switch beside it
 *      says on or off. A word that grows when clicked drags its neighbours.
 *   4. The arrows close the row, hard against the right edge, with every
 *      toggle queued to their left. Nothing stands to their right, so nothing
 *      can move them: in the month, which has no toggles at all, they are
 *      where they are in the week, which has two. The word between them is the
 *      same in all three views for the same reason.
 *   5. What the week has to say — conflicts, weather — sits in a box of fixed
 *      width. Stretched across the row it read as a banner with two words in
 *      it; at a fixed width it reads as the counter it is, and a busy week
 *      scrolls inside it rather than pushing anything along.
 */

import { Fragment, type ReactNode } from 'react'
import Link from 'next/link'
import { btn } from '@/components/ui/button'
import { PageBar, StickyHead } from '@/components/ui/page-panel'
import { TabLink, TabsList } from '@/components/ui/tabs'
import { ToggleKnob, toggleHover, toggleLook } from './schedule-toggle'

export type ScheduleView = 'week' | 'month' | 'map'

export type ScheduleHeaderToggle =
  | {
      /** Where it goes; null when it is on and cannot be switched off. */
      href: string | null
      label: string
      active: boolean
      /** The sentence behind the hover, e.g. why it cannot be switched off. */
      title?: string
    }
  | {
      /**
       * A toggle that answers to something on the page rather than to the
       * address — drawn by its own component with the same look
       * (./schedule-toggle), in the same place in the row.
       */
      key: string
      node: ReactNode
    }

/** The width of the box that says what the week has to say. */
export const scheduleStatusBox =
  'flex h-9 w-80 max-w-full shrink-0 items-center gap-2 overflow-x-auto rounded-lg bg-subtle px-2.5 text-xs'

/** The three views, as the tabs under the page's name. */
export type ScheduleNav = {
  view: ScheduleView
  weekHref: string
  monthHref: string
  mapHref: string
  labels: { week: string; month: string; map: string; aria: string }
}

export function ScheduleHeader({
  title,
  action,
  nav,
}: {
  title: string
  /** The page's own button: planning a new assignment. */
  action?: ReactNode
  nav: ScheduleNav
}) {
  const views: Array<{ key: ScheduleView; href: string; label: string }> = [
    { key: 'week', href: nav.weekHref, label: nav.labels.week },
    { key: 'month', href: nav.monthHref, label: nav.labels.month },
    { key: 'map', href: nav.mapHref, label: nav.labels.map },
  ]
  // No period beside the name. The week says which week it is right above
  // its days, and the month and the map say it on the first row of their
  // sheet; a second copy up here was one more thing to read, and it made the
  // bar's contents change width with the length of a month's name.
  return (
    <StickyHead>
      <PageBar
        title={title}
        actions={action}
        tabs={
          <TabsList ariaLabel={nav.labels.aria}>
            {views.map((v) => (
              <TabLink key={v.key} href={v.href} active={v.key === nav.view} label={v.label} />
            ))}
          </TabsList>
        }
      />
    </StickyHead>
  )
}

export function ScheduleControls({
  prevHref,
  nextHref,
  currentHref,
  currentLabel,
  prevLabel,
  nextLabel,
  toggles = [],
  children,
}: {
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
  return (
    <div className="flex h-9 shrink-0 items-center gap-3 overflow-x-auto">
      <div className="flex h-full min-w-0 flex-1 items-center">{children}</div>
      <div className="flex shrink-0 items-center justify-end gap-2">
        {/* The arrows close the row and the toggles queue to their left — so
            nothing that comes and goes can move the arrows a person is aiming at. */}
        {[...toggles].reverse().map((toggle) => {
          if ('node' in toggle) return <Fragment key={toggle.key}>{toggle.node}</Fragment>
          const locked = toggle.href === null
          // Same words, same width, whichever way it stands.
          const look = toggleLook({ active: toggle.active, locked })
          const knob = <ToggleKnob active={toggle.active} />
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
              className={`${look} ${toggleHover}`}
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
