'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { BrandMark } from './brand-mark'

type NavItem = { href: string; key: string; adminOnly?: boolean }

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', key: 'dashboard' },
  { href: '/projects', key: 'projects' },
  { href: '/customers', key: 'customers' },
  { href: '/schedule', key: 'schedule' },
  { href: '/employees', key: 'employees' },
  { href: '/vehicles', key: 'vehicles' },
  { href: '/warehouse', key: 'warehouse' },
  { href: '/reports', key: 'reports' },
  { href: '/settings', key: 'settings', adminOnly: true },
]

function NavLinks({
  isAdmin,
  pathname,
  onNavigate,
}: {
  isAdmin: boolean
  pathname: string
  onNavigate?: () => void
}) {
  const t = useTranslations('nav')
  return (
    <nav className="flex-1 space-y-0.5 p-2">
      {NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/')
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`block rounded-md px-3 py-2.5 text-sm font-medium transition-colors md:py-2 ${
              active
                ? 'bg-accent text-accent-foreground'
                : 'text-muted hover:bg-surface-hover hover:text-foreground'
            }`}
          >
            {t(item.key)}
          </Link>
        )
      })}
    </nav>
  )
}

/** Desktop sidebar (md+). */
export function Sidebar({
  isAdmin,
  brandName,
  hasLogo,
}: {
  isAdmin: boolean
  brandName: string
  hasLogo: boolean
}) {
  const pathname = usePathname()
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface md:flex print:hidden">
      <div className="flex h-14 items-center border-b border-border px-3">
        <Link href="/dashboard" title={brandName}>
          <BrandMark hasLogo={hasLogo} name={brandName} />
        </Link>
      </div>
      <NavLinks isAdmin={isAdmin} pathname={pathname} />
    </aside>
  )
}

/** Mobile: hamburger button + slide-in drawer (below md). */
export function MobileNav({
  isAdmin,
  brandName,
  hasLogo,
}: {
  isAdmin: boolean
  brandName: string
  hasLogo: boolean
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const tNav = useTranslations('nav')

  // The drawer closes when a link is tapped (onNavigate) — no effect needed
  // for route changes. Lock scroll + Escape while open.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="md:hidden print:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={tNav('menu')}
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-md border border-border text-foreground hover:bg-surface-hover"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label={tNav('closeMenu')}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col border-r border-border bg-surface shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-border px-3">
              <BrandMark hasLogo={hasLogo} name={brandName} />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={tNav('closeMenu')}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted hover:bg-surface-hover hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <NavLinks isAdmin={isAdmin} pathname={pathname} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </div>
  )
}
