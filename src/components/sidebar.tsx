'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Building2,
  CalendarDays,
  ChevronsUpDown,
  Handshake,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Package,
  PieChart,
  Settings,
  Truck,
  Users,
  X,
} from 'lucide-react'
import { BrandMark } from './brand-mark'
import { logout } from '@/app/actions'
import { Menu, MenuLabel, MenuRow, MenuSeparator, menuItemClass } from './ui/menu'
import { LanguageSwitcher } from './language-switcher'
import { ThemeToggle } from './theme-toggle'

type NavItem = { href: string; key: string; icon: typeof LayoutDashboard }
type NavGroup = { labelKey: string; items: NavItem[] }

/** Two groups, in the spirit of a shadcn sidebar: daily work vs. master data. */
const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: 'groupWork',
    items: [
      { href: '/dashboard', key: 'dashboard', icon: LayoutDashboard },
      { href: '/projects', key: 'projects', icon: Building2 },
      { href: '/schedule', key: 'schedule', icon: CalendarDays },
      { href: '/reports', key: 'reports', icon: PieChart },
    ],
  },
  {
    labelKey: 'groupData',
    items: [
      { href: '/customers', key: 'customers', icon: Handshake },
      { href: '/employees', key: 'employees', icon: Users },
      { href: '/vehicles', key: 'vehicles', icon: Truck },
      { href: '/warehouse', key: 'warehouse', icon: Package },
    ],
  },
]

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + '/')
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const t = useTranslations('nav')
  return (
    <div className="flex-1 overflow-y-auto px-2 py-2">
      {NAV_GROUPS.map((group) => (
        <div key={group.labelKey} className="mb-2">
          <p className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted/80">
            {t(group.labelKey)}
          </p>
          <nav className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors md:py-1.5 ${
                    active
                      ? 'bg-surface-hover font-medium text-foreground'
                      : 'text-muted hover:bg-surface-hover/70 hover:text-foreground'
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-accent' : ''}`} aria-hidden />
                  <span className="truncate">{t(item.key)}</span>
                </Link>
              )
            })}
          </nav>
        </div>
      ))}
    </div>
  )
}

/** Footer: user button that opens a menu (settings, sign out) — shadcn style. */
function UserMenu({ username, role, isAdmin }: { username: string; role: string; isAdmin: boolean }) {
  const t = useTranslations('nav')
  const tAuth = useTranslations('auth')
  return (
    <div className="border-t border-border p-2">
      <Menu
        side="top"
        label={username}
        className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface-hover"
        trigger={
          <>
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-xs font-semibold uppercase text-accent"
            >
              {username.slice(0, 2)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{username}</span>
              <span className="block truncate text-xs text-muted">{role}</span>
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          </>
        }
      >
        <MenuLabel>{username}</MenuLabel>
        <MenuSeparator />
        <MenuRow label={t('language')}>
          <LanguageSwitcher compact />
        </MenuRow>
        <MenuRow label={t('theme')}>
          <ThemeToggle withLabel />
        </MenuRow>
        <MenuSeparator />
        {isAdmin && (
          <Link href="/settings" className={menuItemClass} role="menuitem">
            <Settings className="h-4 w-4 text-muted" aria-hidden />
            {t('settings')}
          </Link>
        )}
        <form action={logout}>
          <button type="submit" role="menuitem" className={`${menuItemClass} text-danger hover:bg-danger/10`}>
            <LogOut className="h-4 w-4" aria-hidden />
            {tAuth('logout')}
          </button>
        </form>
      </Menu>
    </div>
  )
}

/** Desktop sidebar (md+), sticky over the full viewport height. */
export function Sidebar({
  isAdmin,
  brandName,
  hasLogo,
  username,
  role,
}: {
  isAdmin: boolean
  brandName: string
  hasLogo: boolean
  username: string
  role: string
}) {
  const pathname = usePathname()
  return (
    <aside className="hidden w-60 shrink-0 md:block print:hidden">
      <div className="sticky top-0 flex h-screen flex-col border-r border-border bg-sidebar">
        <div className="shrink-0 border-b border-border px-3 py-2.5">
          <Link href="/dashboard" title={brandName} className="block">
            <BrandMark hasLogo={hasLogo} name={brandName} />
            {hasLogo && (
              <span className="mt-1.5 block truncate text-xs font-medium text-muted">{brandName}</span>
            )}
          </Link>
        </div>
        <NavLinks pathname={pathname} />
        <UserMenu username={username} role={role} isAdmin={isAdmin} />
      </div>
    </aside>
  )
}

/** Mobile: hamburger button + slide-in drawer (below md). */
export function MobileNav({
  isAdmin,
  brandName,
  hasLogo,
  username,
  role,
}: {
  isAdmin: boolean
  brandName: string
  hasLogo: boolean
  username: string
  role: string
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
        <MenuIcon className="h-5 w-5" aria-hidden />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label={tNav('closeMenu')}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col border-r border-border bg-sidebar shadow-xl">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2.5">
              <span className="min-w-0">
                <BrandMark hasLogo={hasLogo} name={brandName} />
                {hasLogo && (
                  <span className="mt-1.5 block truncate text-xs font-medium text-muted">{brandName}</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={tNav('closeMenu')}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted hover:bg-surface-hover hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
            <UserMenu username={username} role={role} isAdmin={isAdmin} />
          </aside>
        </div>
      )}
    </div>
  )
}
