'use client'

/**
 * The bell in the corner: how many comments have named the user since they
 * last looked, and behind it the list — project, who wrote, what. Opening
 * the list is looking; the count goes. On the office side each line opens
 * the project; on the phone the line is the message itself.
 */

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Bell } from 'lucide-react'
import { markMentionsSeen } from '@/app/mentions-actions'

export type MentionRow = {
  id: string
  /** Where the line leads, or null when there is nowhere to go on this side. */
  href: string | null
  project: string
  author: string
  snippet: string
  when: string
  fresh: boolean
}

export function MentionsBell({ items, unread }: { items: MentionRow[]; unread: number }) {
  const t = useTranslations('projects')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [, startTransition] = useTransition()
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && unread > 0) {
      startTransition(async () => {
        await markMentionsSeen()
        router.refresh()
      })
    }
  }

  const line = (item: MentionRow) => (
    <>
      <span className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs font-medium">{item.project}</span>
        <span className="shrink-0 text-[11px] tabular-nums text-muted">{item.when}</span>
      </span>
      <span className="mt-0.5 block text-sm">
        <span className="font-medium">{item.author}</span>
        <span className="text-muted"> — </span>
        <span className="text-muted">{item.snippet}</span>
      </span>
    </>
  )

  return (
    <div ref={box} className="fixed bottom-4 right-4 z-40 print:hidden">
      {open && (
        <div
          role="dialog"
          aria-label={t('mentionsTitle')}
          className="absolute bottom-13 right-0 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
        >
          <p className="border-b border-border px-3 py-2 text-sm font-semibold">{t('mentionsTitle')}</p>
          {items.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted">{t('mentionsNone')}</p>
          ) : (
            <ul className="max-h-96 divide-y divide-border overflow-y-auto">
              {items.map((item) => (
                <li key={item.id} className={item.fresh ? 'bg-accent/5' : ''}>
                  {item.href ? (
                    <Link href={item.href} onClick={() => setOpen(false)} className="block px-3 py-2 transition-colors hover:bg-surface-hover">
                      {line(item)}
                    </Link>
                  ) : (
                    <div className="px-3 py-2">{line(item)}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={unread > 0 ? `${t('mentionsTitle')}: ${t('mentionsNew', { count: unread })}` : t('mentionsTitle')}
        title={t('mentionsTitle')}
        className={`relative flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface shadow-lg transition-colors hover:text-foreground ${
          unread > 0 ? 'text-accent' : 'text-muted'
        }`}
      >
        <Bell className="h-5 w-5" aria-hidden />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-accent px-1.5 text-center text-[11px] font-semibold leading-5 text-accent-foreground">
            {unread}
          </span>
        )}
      </button>
    </div>
  )
}
