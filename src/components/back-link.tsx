'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { readPreviousPath, subscribeNav } from './nav-history'

/** Consistent "← back" pill used at the top of detail/sub pages. */
export const backLinkClass =
  'mb-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-sm font-medium text-muted shadow-sm transition-colors hover:bg-surface-hover hover:text-foreground'

/**
 * Smart back link: if the user arrived from another page of the app (tracked
 * by <NavHistory/>) that is not the fallback list, the pill reads "← Zurück" and
 * steps back to it. Otherwise it links to `href` with `label` (the list the
 * record belongs to). Server render always shows the fallback.
 *
 * It pops the history rather than pushing the remembered page: pushing would
 * grow the stack forwards, so the browser's own back gesture — a two-finger
 * swipe on a laptop — would immediately undo the pill and land the user back
 * where they just left.
 */
export function BackLink({
  href,
  label,
  inline = false,
}: {
  href: string
  label: string
  /**
   * Beside the page's title in its bar, rather than on a line of its own above
   * it. Stacked, the pill made every sub-page's bar a third taller than the
   * bar of the list it came from, so the top of the page jumped on every click
   * between the two. Inline, it loses only the space it used to keep below it.
   */
  inline?: boolean
}) {
  const className = inline ? backLinkClass.replace('mb-2 ', 'shrink-0 ') : backLinkClass
  const tc = useTranslations('common')
  const router = useRouter()
  const pathname = usePathname()
  const from = useSyncExternalStore(
    subscribeNav,
    () => readPreviousPath(pathname),
    () => ''
  )
  const fromPath = from.split('?')[0]
  const fallbackPath = href.split('?')[0]
  const smart = from !== '' && fromPath !== pathname && fromPath !== fallbackPath

  if (smart) {
    return (
      <button type="button" onClick={() => router.back()} className={className} title={from}>
        <span aria-hidden className="text-base leading-none">
          ←
        </span>
        {tc('back')}
      </button>
    )
  }
  return (
    <Link href={href} className={className}>
      <span aria-hidden className="text-base leading-none">
        ←
      </span>
      {label}
    </Link>
  )
}
