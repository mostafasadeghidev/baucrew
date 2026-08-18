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
 * goes back there. Otherwise it links to `href` with `label` (the list the
 * record belongs to). Server render always shows the fallback.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
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
      <button type="button" onClick={() => router.push(from)} className={backLinkClass} title={from}>
        <span aria-hidden className="text-base leading-none">
          ←
        </span>
        {tc('back')}
      </button>
    )
  }
  return (
    <Link href={href} className={backLinkClass}>
      <span aria-hidden className="text-base leading-none">
        ←
      </span>
      {label}
    </Link>
  )
}
