'use client'

/**
 * The numbered badge in the day list, made clickable: it does to the map
 * exactly what clicking the pin does — the map moves to the site and its
 * bubble opens.
 *
 * It is a button rather than a link because nothing about the page changes:
 * no other row opens, no address is written, the back button has nothing to
 * undo. The number is the only thing tying the list to the map, so it is
 * worth making it work in both directions.
 */

import { FOCUS_SITE_EVENT } from './site-map'

export function FocusSiteButton({
  siteId,
  index,
  color,
  label,
}: {
  siteId: string
  index: number
  color: string
  /** What the button is called for a screen reader, e.g. "Auf der Karte zeigen". */
  label: string
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={`${label}: ${index}`}
      onClick={() => window.dispatchEvent(new CustomEvent(FOCUS_SITE_EVENT, { detail: siteId }))}
      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      style={{ background: color }}
    >
      {index}
    </button>
  )
}
