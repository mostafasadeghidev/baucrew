'use client'

/**
 * A project opened over the board, the way a Trello card opens: the board
 * stays where it is underneath, and the sheet carries the project's page —
 * every card of it, every form. Which project is open lives in the address
 * (`?card=<id>`), so a sheet can be sent as a link and the browser's back
 * gesture closes it.
 *
 * It is closed on purpose only: Escape, or the cross at the right end of the
 * project's own bar. A click beside the sheet does nothing — the sheet holds
 * forms, and a slip of the mouse must not throw away what was typed.
 */

import { useEffect, useSyncExternalStore, useTransition, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { lockPageScroll } from '@/lib/scroll-lock'

/** Takes the card out of the address, which is what closes the sheet. */
function useCloseSheet() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  return () => {
    const params = new URLSearchParams(searchParams)
    params.delete('card')
    const qs = params.toString()
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }
}

/** The round buttons over the top of Trello's card: cover, menu, close. */
export const ROUND_BUTTON =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface/90 text-foreground/80 shadow-sm transition-colors hover:bg-surface hover:text-foreground'

/** The cross — the last of the round buttons over the card, or of the bar where there is no card around it. */
export function SheetClose({ round = false }: { round?: boolean }) {
  const t = useTranslations('projects')
  const close = useCloseSheet()
  return (
    <button
      type="button"
      onClick={close}
      aria-label={t('cardClose')}
      title={t('cardClose')}
      className={round ? ROUND_BUTTON : 'rounded-md border border-border p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground'}
    >
      <X className="h-4 w-4" aria-hidden />
    </button>
  )
}

export function CardSheet({ children }: { children: ReactNode }) {
  const close = useCloseSheet()

  // Client-only render (portal target); no setState-in-effect.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  useEffect(() => {
    const unlock = lockPageScroll()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      unlock()
    }
    // `close` reads the address as it stands when the key is pressed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!mounted) return null

  // Trello's card: a white sheet over the dimmed board, the cover across its
  // top, and on a wide screen two columns that scroll on their own — the card
  // on the left, the talk on the right. On a phone the whole sheet scrolls.
  return createPortal(
    <div className="fixed inset-0 z-[70] overflow-y-auto">
      <div aria-hidden className="fixed inset-0 bg-black/60" />
      <div className="relative mx-auto my-3 w-full max-w-[1080px] px-3 sm:my-10">
        <div
          role="dialog"
          aria-modal="true"
          className="overflow-hidden rounded-xl bg-surface shadow-2xl lg:flex lg:max-h-[calc(100dvh-5rem)] lg:flex-col"
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
