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

/** The cross — the last button of the project's bar while it is shown in the sheet. */
export function SheetClose() {
  const t = useTranslations('projects')
  const close = useCloseSheet()
  return (
    <button
      type="button"
      onClick={close}
      aria-label={t('cardClose')}
      title={t('cardClose')}
      className="rounded-md border border-border p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
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

  return createPortal(
    <div className="fixed inset-0 z-[70] overflow-y-auto">
      <div aria-hidden className="fixed inset-0 bg-black/50" />
      <div className="relative mx-auto my-4 w-full max-w-5xl px-4 sm:my-8">
        <div role="dialog" aria-modal="true" className="rounded-xl border border-border bg-background p-5 shadow-2xl">
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
