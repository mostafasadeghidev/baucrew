'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { lockPageScroll } from '@/lib/scroll-lock'
import { useTranslations } from 'next-intl'
import {
  Building2,
  CalendarDays,
  ChevronsUpDown,
  Handshake,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Package,
  PieChart,
  Settings,
  Truck,
  Users,
  X, Wrench } from 'lucide-react'
import { BrandMark } from './brand-mark'
import { logout } from '@/app/actions'
import { Menu, MenuLabel, MenuRow, MenuSeparator, menuItemClass } from './ui/menu'
import { LanguageSwitcher } from './language-switcher'
import { ThemeToggle } from './theme-toggle'
import { RailTip } from './ui/rail-tip'
import { SIDEBAR_COOKIE, SIDEBAR_COOKIE_MAX_AGE, sidebarCookieValue } from '@/lib/sidebar'

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
      { href: '/devices', key: 'devices', icon: Wrench },
    ],
  },
]

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + '/')
}

function NavLinks({
  pathname,
  onNavigate,
  collapsed = false,
}: {
  pathname: string
  onNavigate?: () => void
  /** Folded to a rail: icons only, each named by a tooltip beside it. */
  collapsed?: boolean
}) {
  const t = useTranslations('nav')
  return (
    <div className={`flex-1 overflow-y-auto py-2 ${collapsed ? 'px-1.5' : 'px-2'}`}>
      {NAV_GROUPS.map((group) => (
        <div key={group.labelKey} className="mb-2">
          {collapsed ? (
            // The group's name has nowhere to go on a rail; a hairline keeps
            // the two groups apart, which is what the name was doing.
            <div className="mx-2 mb-1.5 border-t border-border first:hidden" aria-hidden />
          ) : (
            <p className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted/80">
              {t(group.labelKey)}
            </p>
          )}
          <nav className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href)
              const Icon = item.icon
              const link = (
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  aria-label={collapsed ? t(item.key) : undefined}
                  title={undefined}
                  className={`flex items-center rounded-md text-sm transition-colors ${
                    collapsed ? 'justify-center px-2 py-2' : 'gap-2.5 px-2.5 py-2 md:py-1.5'
                  } ${
                    active
                      ? 'bg-surface-hover font-medium text-foreground'
                      : 'text-muted hover:bg-surface-hover/70 hover:text-foreground'
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-accent' : ''}`} aria-hidden />
                  {!collapsed && <span className="truncate">{t(item.key)}</span>}
                </Link>
              )
              return collapsed ? (
                <RailTip key={item.href} label={t(item.key)}>
                  {link}
                </RailTip>
              ) : (
                <div key={item.href}>{link}</div>
              )
            })}
          </nav>
        </div>
      ))}
    </div>
  )
}

/** Footer: user button that opens a menu (settings, sign out) — shadcn style. */
function UserMenu({
  username,
  role,
  isAdmin,
  collapsed = false,
}: {
  username: string
  role: string
  isAdmin: boolean
  collapsed?: boolean
}) {
  const t = useTranslations('nav')
  const tAuth = useTranslations('auth')
  return (
    <div className={`border-t border-border ${collapsed ? 'p-1.5' : 'p-2'}`}>
      <Menu
        side="top"
        label={username}
        className={`flex w-full items-center rounded-md text-left transition-colors hover:bg-surface-hover ${
          collapsed ? 'justify-center px-1 py-1.5' : 'gap-2.5 px-2 py-2'
        }`}
        trigger={
          <>
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-xs font-semibold uppercase text-accent"
            >
              {username.slice(0, 2)}
            </span>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{username}</span>
                  <span className="block truncate text-xs text-muted">{role}</span>
                </span>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              </>
            )}
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

/**
 * Desktop sidebar (md+), sticky over the full viewport height, open or folded
 * to a rail of icons. The server already knows which — it reads the cookie —
 * so the page never arrives one width and changes to the other.
 */
export function Sidebar({
  isAdmin,
  brandName,
  hasLogo,
  username,
  role,
  defaultCollapsed = false,
}: {
  isAdmin: boolean
  brandName: string
  hasLogo: boolean
  username: string
  role: string
  defaultCollapsed?: boolean
}) {
  const pathname = usePathname()
  const t = useTranslations('nav')
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  const toggle = useCallback(() => {
    setCollapsed((was) => {
      const next = !was
      document.cookie = `${SIDEBAR_COOKIE}=${sidebarCookieValue(next)}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; samesite=lax`
      return next
    })
  }, [])

  // The shortcut every editor and every sidebar of this kind uses.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'b' || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
      e.preventDefault()
      toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  const Fold = collapsed ? PanelLeftOpen : PanelLeftClose
  const foldLabel = collapsed ? t('expandSidebar') : t('collapseSidebar')

  return (
    /**
     * The rail is a panel standing on the page, not a column welded to the
     * left edge of the window: eight pixels of air all round, a border the
     * whole way round instead of one down its right-hand side, and the same
     * rounded corners and quiet shadow every card on the page wears.
     *
     * The column is sixteen pixels wider than the panel inside it — w-20 for
     * w-16, w-64 for w-60 — so those eight pixels a side come out of the page
     * and not out of the rail. The icons and the labels sit exactly where they
     * sat before; change these two numbers back and the panel gets narrower
     * rather than the gap disappearing.
     *
     * `overflow-hidden` because the brand row and the user row draw a rule the
     * full width of the panel, and a straight rule crosses a rounded corner.
     * The folded rail's labels are not caught by it: they are drawn into the
     * document body, not into this box (see `RailTip`).
     *
     * `top-2` with `h-[calc(100vh-1rem)]` keeps the panel stuck to the window
     * with its air above and below it. The air is the panel's own margin on
     * purpose — padding on the page around it would add sixteen pixels to
     * every page's height and hand each one a scrollbar it does not need.
     */
    <aside
      className={`hidden shrink-0 transition-[width] duration-200 md:block print:hidden ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      <div className="sticky top-2 m-2 flex h-[calc(100vh-1rem)] flex-col overflow-hidden rounded-xl border border-border bg-sidebar shadow-sm">
        <div
          className={`flex shrink-0 items-center gap-2 border-b border-border py-2.5 ${
            collapsed ? 'justify-center px-1.5' : 'px-3'
          }`}
        >
          {!collapsed && (
            <Link href="/dashboard" title={brandName} className="block min-w-0 flex-1">
              <BrandMark hasLogo={hasLogo} name={brandName} />
              {hasLogo && (
                <span className="mt-1.5 block truncate text-xs font-medium text-muted">{brandName}</span>
              )}
            </Link>
          )}
          <RailTip label={foldLabel} className="shrink-0">
            <button
              type="button"
              onClick={toggle}
              aria-label={foldLabel}
              aria-expanded={!collapsed}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <Fold className="h-4 w-4" aria-hidden />
            </button>
          </RailTip>
        </div>
        <NavLinks pathname={pathname} collapsed={collapsed} />
        <UserMenu username={username} role={role} isAdmin={isAdmin} collapsed={collapsed} />
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
    const unlock = lockPageScroll()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      unlock()
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
