'use client'

import Link, { useLinkStatus } from 'next/link'
import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { BOARD_COOKIE } from '@/lib/boards'

/**
 * Says to a screen reader that the board is on its way. Nothing is drawn: a
 * line flashing under the pill for the moment the board takes to arrive read
 * as a glitch.
 */
function PendingHint() {
  const { pending } = useLinkStatus()
  const t = useTranslations('common')
  return <span role="status" className="sr-only">{pending ? t('loading') : ''}</span>
}

/**
 * Which board this browser opened last, so the page comes back to it. Set in
 * the browser itself: a display preference, never an authentication credential.
 */
export function rememberBoardHere(id: string) {
  document.cookie = `${BOARD_COOKIE}=${encodeURIComponent(id)}; Path=/; SameSite=Lax; Max-Age=31536000`
}

/** Link semantics and pending state, without a second server action per click. */
export function ProjectNavLink({ href, active, rememberBoard, className, children, title, role }: {
  href: string
  title?: string
  role?: "menuitemradio"
  active?: boolean
  rememberBoard?: string
  className: string
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      title={title}
      role={role}
      aria-checked={role ? !!active : undefined}
      replace
      scroll={false}
      aria-current={active ? 'page' : undefined}
      className={`relative ${className}`}
      onNavigate={() => {
        if (rememberBoard) rememberBoardHere(rememberBoard)
      }}
    >
      {children}
      <PendingHint />
    </Link>
  )
}
