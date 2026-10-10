'use client'

/**
 * The card's sheet frame, on the same frame as the click — before the server
 * has answered anything. A click on a board card, a list row or a card link
 * is caught as it happens (capture, before the board's own handler starts the
 * navigation), the skeleton appears at once, and when the card's route takes
 * over, this frame hands the place over to it: the skeleton this draws and
 * the route's loading state are the same picture, so the handover is not
 * worth a flicker.
 *
 * The frame goes away again when the card's address stands in the window
 * (the real sheet is there, or on its way), when a close wins the race — the
 * cross, Escape and a click beside it all work here like on the real sheet,
 * and since the card's address is already in the window while it loads, they
 * simply go back — and after a short grace when no navigation followed at
 * all (a click the board kept to itself).
 */

import { useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cardPath, isCardPath } from '@/lib/card-url'
import { CardSheet, SheetClose } from './card-sheet'

/** What the sheet shows while its content is on the way — here and in the route's loading state, the same. */
export function CardSheetPending() {
  const t = useTranslations('projects')
  return (
    <div className="flex items-center justify-between gap-3 p-4">
      <p className="px-2 py-6 text-sm text-muted">{t('cardLoading')}</p>
      <SheetClose />
    </div>
  )
}

/** The card a click is about to open, while the sheet is not there yet. */
export function PendingCardSheet() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, setPending] = useState<string | null>(null)
  /** The click this frame is for — so a second click replaces, not doubles. */
  const lastClick = useRef(0)

  useEffect(() => {
    const cardIdFrom = (target: EventTarget | null): string | null => {
      if (!(target instanceof Element)) return null
      // What the board itself ignores: a click on a control of the card is
      // that control's, not the card's.
      if (target.closest('a, button, input, textarea, select, [role="menuitem"]')) {
        const link = target.closest<HTMLAnchorElement>('a[href*="/projects/card/"]')
        if (!link) return null
        const id = link.getAttribute('href')?.match(/^\/projects\/card\/([^/?]+)/)?.[1]
        return id ?? null
      }
      return target.closest('[data-card-id]')?.getAttribute('data-card-id') ?? null
    }
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const id = cardIdFrom(e.target)
      if (!id) return
      lastClick.current = Date.now()
      setPending(id)
    }
    // Capture: this runs before the board's own click starts the navigation,
    // so the frame is drawn in the same commit as the navigation begins.
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  // Does the address already show this card (its route, or the board page's ?card=)?
  const opened = pending !== null && (isCardPath(pathname) ? pathname.startsWith(cardPath(pending)) : searchParams.get('card') === pending)

  // The frame goes away: at once when the real sheet has taken over (it hides
  // itself above; this only forgets the click), and after a short grace when
  // no navigation followed the click at all — or a close won the race.
  useEffect(() => {
    if (!pending) return
    const timer = setTimeout(() => setPending(null), opened ? 0 : 700)
    return () => clearTimeout(timer)
  }, [pending, opened])

  if (!pending || opened) return null
  return (
    <CardSheet>
      <CardSheetPending />
    </CardSheet>
  )
}
