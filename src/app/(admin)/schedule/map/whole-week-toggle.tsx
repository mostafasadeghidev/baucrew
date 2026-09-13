'use client'

/**
 * The map's "Ganze Woche" switch.
 *
 * It is on while the map shows the whole week, every site at once. It goes off
 * when a single day is picked — and also when the map comes to a single site,
 * after a number in the list was clicked. Off, it is the way back: one click
 * and every site of the week is in view again, without hunting for them with
 * the wheel.
 *
 * Picking a day changes the address, so going back to the week is a link. Coming
 * to a site does not — it is a move of the map, not a place — so going back from
 * it is a button that asks the map, and the map says when it is showing
 * everything again (MAP_VIEW_EVENT).
 */

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { MAP_VIEW_EVENT, SHOW_ALL_SITES_EVENT, type MapView } from './site-map'
import { ToggleKnob, toggleHover, toggleLook } from '../schedule-toggle'

export function WholeWeekToggle({
  label,
  dayHref,
  titles,
}: {
  label: string
  /** Back to the whole week while a single day is picked; null when none is. */
  dayHref: string | null
  titles: { on: string; backToWeek: string; backToAll: string }
}) {
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    const onView = (event: Event) => setFocused((event as CustomEvent<MapView>).detail === 'focus')
    window.addEventListener(MAP_VIEW_EVENT, onView)
    return () => window.removeEventListener(MAP_VIEW_EVENT, onView)
  }, [])

  if (dayHref) {
    return (
      <Link
        href={dayHref}
        title={titles.backToWeek}
        role="switch"
        aria-checked={false}
        className={`${toggleLook({ active: false, locked: false })} ${toggleHover}`}
      >
        <ToggleKnob active={false} />
        {label}
      </Link>
    )
  }

  // One button whichever way it stands: swapping it for a plain element when it
  // goes on again would take the keyboard's focus away with it, and a screen
  // reader would never hear the switch change.
  return (
    <button
      type="button"
      title={focused ? titles.backToAll : titles.on}
      role="switch"
      aria-checked={!focused}
      aria-disabled={!focused}
      onClick={() => {
        if (focused) window.dispatchEvent(new CustomEvent(SHOW_ALL_SITES_EVENT))
      }}
      className={
        focused
          ? `${toggleLook({ active: false, locked: false })} ${toggleHover}`
          : `${toggleLook({ active: true, locked: true })} cursor-not-allowed`
      }
    >
      <ToggleKnob active={!focused} />
      {label}
    </button>
  )
}
