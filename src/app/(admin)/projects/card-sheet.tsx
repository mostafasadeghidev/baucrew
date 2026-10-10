'use client'

/**
 * A project opened over the board, the way a Trello card opens: the board
 * stays where it is underneath, and the sheet carries the project's page —
 * every card of it, every form. Which project is open lives in the address
 * (`/projects/card/<id>`, or `?card=<id>` where the board page itself draws
 * the sheet), so a sheet can be sent as a link and the browser's back
 * gesture closes it.
 *
 * It closes with Escape, the cross at the right end of the project's own bar,
 * or a click on the dimmed board beside it, as Trello's card does. The sheet
 * holds forms, so a click beside it is careful not to throw away work:
 * - it counts only when the press both starts and ends beside the sheet — a
 *   text selection dragged out of the card is not a click outside;
 * - while a menu, popover or dialog of the card is open, the click only closes
 *   that, the way it would anywhere else;
 * - with typing not yet saved — the field the cursor is in, or a comment
 *   draft (`data-sheet-draft`) — it asks before closing. Fields that save when
 *   they are left (`data-saves-on-blur`) are saved by that same click.
 * Escape closes whatever stands over the card first — a list, a menu, a small
 * window — and the card only when nothing does and no field claimed the key.
 *
 * A card template opens in the same window (`?template=<id>`), narrower, the
 * way Trello opens a template card.
 */

import { useEffect, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { lockPageScroll } from '@/lib/scroll-lock'
import { isCardPath } from '@/lib/card-url'
import { AlertDialog } from '@/components/ui/alert-dialog'

/** Text fields whose content is work: what would be lost by closing. */
const TEXT_TYPES = new Set(['text', 'url', 'email', 'tel', 'number'])

/** Typing in the sheet that nothing has saved yet. */
function unsavedTyping(sheet: HTMLElement): boolean {
  const active = document.activeElement
  const typing =
    (active instanceof HTMLTextAreaElement || (active instanceof HTMLInputElement && TEXT_TYPES.has(active.type))) &&
    sheet.contains(active) &&
    !active.closest('[data-saves-on-blur]') &&
    active.getAttribute('role') !== 'combobox' &&
    active.value.trim() !== ''
  if (typing) return true
  return [...sheet.querySelectorAll<HTMLTextAreaElement | HTMLInputElement>('[data-sheet-draft]')].some(
    (field) => field.value.trim() !== ''
  )
}

/**
 * A menu, popover or dialog of the card is open. They are portalled to the end
 * of the page, above the sheet, so anything with such a role outside the sheet
 * is one of them; inside it, an open dropdown says so with `aria-expanded`.
 */
function layerOpen(sheet: HTMLElement): boolean {
  const layers = document.querySelectorAll('[role="menu"], [role="dialog"], [role="alertdialog"], [role="listbox"]')
  for (const layer of layers) if (layer !== sheet && !sheet.contains(layer)) return true
  return sheet.querySelector('[aria-expanded="true"], [role="listbox"]') !== null
}

/**
 * Takes the card, or the template, out of the address, which is what closes
 * the sheet. A card opened from the board or the list lives at its own
 * address (/projects/card/<id>): closing goes back, which restores the board
 * or the list as it was, without a server round trip. The board page's own
 * sheet (?card=<id>, where a save returns to) closes by taking the card out
 * of the address.
 */
function useCloseSheet() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  return () => {
    if (isCardPath(pathname)) {
      router.back()
      return
    }
    const params = new URLSearchParams(searchParams)
    params.delete('card')
    params.delete('template')
    const qs = params.toString()
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }
}

/** The round buttons over the top of Trello's card: cover, menu, close. */
export const ROUND_BUTTON =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface/90 text-foreground/80 transition-colors hover:bg-surface hover:text-foreground'

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

/**
 * Whether something stands over the sheet that Escape closes first: a list of
 * options, a menu, a confirmation, another window (a small window on the card,
 * the new-customer window, a file's preview). Escape then closes that, and the
 * card with what was typed on it stays.
 */
function layerAbove(sheet: HTMLElement | null) {
  if (document.querySelector('[role="listbox"], [role="menu"], [role="alertdialog"]')) return true
  return [...document.querySelectorAll('[role="dialog"]')].some((d) => d !== sheet)
}

export function CardSheet({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  const close = useCloseSheet()
  const t = useTranslations('projects')
  const tc = useTranslations('common')
  const sheet = useRef<HTMLDivElement>(null)
  // The address as it stands when the key is pressed, not as it stood when the sheet opened.
  const closeNow = useRef(close)
  useEffect(() => {
    closeNow.current = close
  })
  // What a press beside the sheet will do once it is let go: nothing, close,
  // or ask first. Read at the press — by the click, the field has lost focus.
  const pressed = useRef<'close' | 'ask' | null>(null)
  const [asking, setAsking] = useState(false)
  const beside = (target: EventTarget) => target instanceof HTMLElement && target.dataset.sheetOutside !== undefined

  // Client-only render (portal target); no setState-in-effect.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
  // On a phone the whole sheet scrolls, the cross at its top with it: once
  // that is out of sight a cross of its own stays at the top of the screen.
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const unlock = lockPageScroll()
    const onKey = (e: KeyboardEvent) => {
      // A field that took Escape for itself (a list of options, a comment
      // box, the new-customer window) has said so; a question on top of the
      // card — "discard?", "delete?" — takes Escape as its own "no".
      if (e.key !== 'Escape' || e.defaultPrevented || layerAbove(sheet.current)) return
      closeNow.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      unlock()
    }
  }, [])

  if (!mounted) return null

  // Trello's card: a white sheet over the dimmed board, the cover across its
  // top, and on a wide screen two columns that scroll on their own — the card
  // on the left, the talk on the right. On a phone the whole sheet scrolls.
  return createPortal(
    <div
      data-sheet-outside
      className="fixed inset-0 z-[70] overflow-y-auto"
      onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 72)}
      onPointerDown={(e) => {
        pressed.current = null
        if (e.button !== 0 || !beside(e.target) || !sheet.current || layerOpen(sheet.current)) return
        pressed.current = unsavedTyping(sheet.current) ? 'ask' : 'close'
      }}
      onClick={(e) => {
        const intent = pressed.current
        pressed.current = null
        // Events from the card's portalled menus bubble here through React
        // too; only a click that lands beside the sheet counts.
        if (!intent || !beside(e.target)) return
        if (intent === 'close') close()
        else setAsking(true)
      }}
    >
      <div aria-hidden data-sheet-outside className="fixed inset-0 bg-black/60" />
      {scrolled && (
        <div className="fixed right-5 top-3 z-[72] lg:hidden">
          <SheetClose round />
        </div>
      )}
      <div data-sheet-outside className={`relative mx-auto my-3 w-full px-3 sm:my-10 ${narrow ? 'max-w-[800px]' : 'max-w-[1080px]'}`}>
        <div
          ref={sheet}
          role="dialog"
          aria-modal="true"
          className="overflow-hidden rounded-xl bg-surface shadow-2xl lg:flex lg:max-h-[calc(100dvh-5rem)] lg:flex-col"
        >
          {children}
        </div>
      </div>
      <AlertDialog
        open={asking}
        title={t('cardDiscardTitle')}
        description={t('cardDiscardBody')}
        confirmLabel={t('cardDiscardConfirm')}
        cancelLabel={tc('cancel')}
        destructive
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false)
          close()
        }}
      />
    </div>,
    document.body
  )
}
