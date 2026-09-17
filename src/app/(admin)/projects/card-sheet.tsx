'use client'

/**
 * A project opened over the board, the way a Trello card opens: the board
 * stays where it is underneath, and the sheet carries the project's page —
 * every card of it, every form. Which project is open lives in the address
 * (`?card=<id>`), so a sheet can be sent as a link and the browser's back
 * gesture closes it. Escape, the backdrop and the cross close it too.
 */

import { useEffect, useSyncExternalStore, useTransition, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ExternalLink, X } from 'lucide-react'
import { lockPageScroll } from '@/lib/scroll-lock'
import { btn } from '@/components/ui/button'

export function CardSheet({ fullHref, children }: { fullHref: string; children: ReactNode }) {
  const t = useTranslations('projects')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  // Client-only render (portal target); no setState-in-effect.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  const close = () => {
    const params = new URLSearchParams(searchParams)
    params.delete('card')
    const qs = params.toString()
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }

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
      <button type="button" aria-label={t('cardClose')} onClick={close} className="fixed inset-0 bg-black/50" />
      <div className="relative mx-auto my-4 w-full max-w-6xl px-4 sm:my-8">
        <div role="dialog" aria-modal="true" className="rounded-xl border border-border bg-background p-5 shadow-2xl">
          {/* The sheet's own row: the way to the whole page, and out. */}
          <div className="mb-3 flex items-center justify-end gap-2">
            <Link href={fullHref} className={`${btn.outlineSm} gap-1.5`}>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              {t('cardOpenFull')}
            </Link>
            <button
              type="button"
              onClick={close}
              aria-label={t('cardClose')}
              title={t('cardClose')}
              className="rounded-md border border-border p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
