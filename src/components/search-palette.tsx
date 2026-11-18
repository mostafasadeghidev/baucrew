'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CornerDownLeft,
  Handshake,
  HardHat,
  History,
  LayoutDashboard,
  ListTodo,
  Loader2,
  Package,
  PieChart,
  Plus,
  Search,
  Settings,
  Truck,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { lockPageScroll } from '@/lib/scroll-lock'
import { boardBaseOf, cardHref } from '@/lib/card-url'
import {
  metaLine,
  moveActive,
  opensSearch,
  parseRecent,
  pushRecent,
  queryWords,
  rankRows,
  type RecentProject,
} from '@/lib/global-search'
import type { ProjectHit, SearchHit, SearchResults } from '@/lib/global-search-db'

/**
 * The search window of the administration area: ⌘K (Ctrl+K) anywhere, or
 * the magnifier in the sidebar, the phone's bar and the overview's head.
 *
 * Results come while typing, grouped — projects first, then customers,
 * employees, vehicles, devices (the office only) and the app's own pages —
 * each group with its icon. ↑ ↓ walk, Enter opens, ⌘Enter opens in a new
 * tab, Esc closes; every row is a link too, so a click, a middle click and a
 * tap do what they do anywhere.
 *
 * A project opens as its card over the board when the board is what is on
 * screen (`/projects`, or Baustellen's board at `/sites`), and as its full page everywhere else — the overview
 * has no board to lay a card over. The projects opened from here are kept
 * per user in the browser and shown while the field is empty.
 *
 * What the server sends is already cut to what the user may see
 * (src/lib/global-search-db.ts); the pages are filtered here by role only
 * for tidiness — every page checks again itself.
 */

const OPEN_EVENT = 'baucrew:open-search'

/** Opens the window from anywhere: a button, a menu, a key. */
export function openSearch() {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

type Role = 'ADMIN' | 'MANAGER' | 'SITE_MANAGER' | string

type PageEntry = {
  key: string
  href: string
  icon: LucideIcon
  /** Who gets it: everybody in the area, the office, or the admin. */
  who: 'staff' | 'office' | 'admin'
  /** Shown while the field is empty. */
  quick?: boolean
}

const PAGES: PageEntry[] = [
  { key: 'newProject', href: '/projects/new', icon: Plus, who: 'office', quick: true },
  { key: 'projects', href: '/projects', icon: Building2, who: 'staff', quick: true },
  { key: 'schedule', href: '/schedule', icon: CalendarDays, who: 'staff', quick: true },
  { key: 'dashboard', href: '/dashboard', icon: LayoutDashboard, who: 'staff' },
  { key: 'sites', href: '/sites', icon: HardHat, who: 'staff' },
  { key: 'reports', href: '/reports', icon: PieChart, who: 'office' },
  { key: 'newCustomer', href: '/customers/new', icon: Plus, who: 'office' },
  { key: 'customers', href: '/customers', icon: Handshake, who: 'office' },
  { key: 'employees', href: '/employees', icon: Users, who: 'office' },
  { key: 'vehicles', href: '/vehicles', icon: Truck, who: 'office' },
  { key: 'warehouse', href: '/warehouse', icon: Package, who: 'office' },
  { key: 'devices', href: '/devices', icon: Wrench, who: 'office' },
  { key: 'feedback', href: '/feedback', icon: ListTodo, who: 'staff' },
  { key: 'settings', href: '/settings', icon: Settings, who: 'admin' },
]

function pagesFor(role: Role): PageEntry[] {
  const office = role === 'ADMIN' || role === 'MANAGER'
  return PAGES.filter((p) => p.who === 'staff' || (p.who === 'office' && office) || (p.who === 'admin' && role === 'ADMIN'))
}

/** One row of the window, whatever it stands for. */
type Row = {
  id: string
  group: GroupKey
  icon: LucideIcon
  title: string
  meta: string
  /** Shown on the right: a project's number. */
  aside?: string
  href: string
  /** A project: opened as card or page, and remembered. */
  project?: RecentProject
}

type GroupKey = 'recent' | 'projects' | 'customers' | 'employees' | 'vehicles' | 'devices' | 'pages'

const GROUP_ICON: Record<Exclude<GroupKey, 'pages'>, LucideIcon> = {
  recent: History,
  projects: Building2,
  customers: Handshake,
  employees: Users,
  vehicles: Truck,
  devices: Wrench,
}

const DEBOUNCE_MS = 140

function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
}

function recentKey(username: string) {
  return `baucrew.search.recent.${username}`
}

function readRecent(username: string): RecentProject[] {
  try {
    return parseRecent(window.localStorage.getItem(recentKey(username)))
  } catch {
    return []
  }
}

export function SearchPalette({ username, role }: { username: string; role: Role }) {
  const t = useTranslations('search')
  const tStatus = useTranslations('status')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const mounted = useMounted()
  const listId = useId()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // The results with the query they answer: while a newer one is under way they are stale.
  const [results, setResults] = useState<{ q: string; data: SearchResults } | null>(null)
  // Enter pressed before the results for what is typed had come: opened once they are here.
  const pendingEnter = useRef<{ newTab: boolean } | null>(null)
  // The query whose request failed; typing on asks again.
  const [failedFor, setFailedFor] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const [recent, setRecent] = useState<RecentProject[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // Where the focus was before the window opened, to hand it back.
  const before = useRef<HTMLElement | null>(null)

  const show = useCallback(() => {
    before.current = document.activeElement as HTMLElement | null
    setRecent(readRecent(username))
    setActive(0)
    setOpen(true)
  }, [username])

  const close = useCallback(() => {
    setOpen(false)
    before.current?.focus?.()
  }, [])

  // ⌘K / Ctrl+K anywhere in the area, and the buttons' event.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!opensSearch(e)) return
      e.preventDefault()
      if (open) close()
      else show()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_EVENT, show)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_EVENT, show)
    }
  }, [open, show, close])

  useEffect(() => {
    if (!open) return
    const unlock = lockPageScroll()
    // The field gets the focus once it stands on the page.
    const frame = requestAnimationFrame(() => inputRef.current?.select())
    return () => {
      cancelAnimationFrame(frame)
      unlock()
    }
  }, [open])

  // The search itself: debounced, and a query typed over an earlier one cancels it.
  const words = queryWords(query)
  const asked = words.join(' ')
  useEffect(() => {
    if (!open || !asked) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(asked)}`, { signal: controller.signal })
        if (!res.ok) throw new Error(String(res.status))
        setResults({ q: asked, data: (await res.json()) as SearchResults })
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        setFailedFor(asked)
      }
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [open, asked])

  const pages = useMemo(() => pagesFor(role), [role])

  const projectRow = useCallback(
    (p: ProjectHit): Row => {
      // The title starts with the customer already ("Muster GmbH · Malern"); no need to say it twice.
      const customer = p.customer && !p.title.startsWith(p.customer) ? p.customer : null
      const meta = metaLine([tStatus(p.status), customer, p.city, p.archived ? t('archived') : null])
      return {
        id: `project:${p.id}`,
        group: 'projects',
        icon: Building2,
        title: p.title,
        meta,
        aside: p.jobNumber ? `${p.number} · ${p.jobNumber}` : p.number,
        href: `/projects/${p.id}`,
        project: { id: p.id, title: p.title, meta: metaLine([p.number, meta]) },
      }
    },
    [t, tStatus]
  )

  const otherRow = useCallback(
    (group: Exclude<GroupKey, 'recent' | 'projects' | 'pages'>, hit: SearchHit): Row => ({
      id: `${group}:${hit.id}`,
      group,
      icon: GROUP_ICON[group],
      title: hit.title,
      meta: metaLine([hit.inactive ? t('inactive') : null, ...hit.meta]),
      href: hit.href,
    }),
    [t]
  )

  const pageRow = useCallback(
    (p: PageEntry): Row => ({ id: `page:${p.key}`, group: 'pages', icon: p.icon, title: t(`pages.${p.key}`), meta: t(`pagesHint.${p.key}`), href: p.href }),
    [t]
  )

  const rows: Row[] = useMemo(() => {
    if (!asked) {
      return [
        ...recent.map((r) => ({
          id: `recent:${r.id}`,
          group: 'recent' as const,
          icon: Building2,
          title: r.title,
          meta: r.meta,
          href: `/projects/${r.id}`,
          project: r,
        })),
        ...pages.filter((p) => p.quick).map(pageRow),
      ]
    }
    const found = results?.data ?? null
    const matchedPages = rankRows(
      pages,
      words,
      (p) => [
        { text: t(`pages.${p.key}`), weight: 3 },
        { text: t(`pagesHint.${p.key}`), weight: 1 },
        { text: t(`pagesWords.${p.key}`), weight: 1 },
      ],
      4
    )
    return [
      ...(found?.projects.map(projectRow) ?? []),
      ...(found?.customers.map((h) => otherRow('customers', h)) ?? []),
      ...(found?.employees.map((h) => otherRow('employees', h)) ?? []),
      ...(found?.vehicles.map((h) => otherRow('vehicles', h)) ?? []),
      ...(found?.devices.map((h) => otherRow('devices', h)) ?? []),
      ...matchedPages.map(pageRow),
    ]
    // `words` is `asked` cut up; `asked` is the dependency that says when it changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked, results, recent, pages, projectRow, otherRow, pageRow, t])

  const current = rows[Math.min(active, Math.max(rows.length - 1, 0))]

  // The active row stays in view while the arrows walk.
  useEffect(() => {
    if (!open || !current) return
    listRef.current?.querySelector(`[data-row="${CSS.escape(current.id)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, current])

  const remember = useCallback(
    (entry: RecentProject) => {
      const next = pushRecent(readRecent(username), entry)
      try {
        window.localStorage.setItem(recentKey(username), JSON.stringify(next))
      } catch {
        // A browser that keeps nothing only loses the list.
      }
    },
    [username]
  )

  const go = useCallback(
    (row: Row, newTab: boolean) => {
      if (row.project) remember(row.project)
      if (newTab) {
        window.open(row.href, '_blank', 'noopener')
        return
      }
      setOpen(false)
      setQuery('')
      setResults(null)
      // Over the board the card opens where it stands; anywhere else the project's page.
      if (row.project && (pathname === '/projects' || pathname === '/sites')) router.push(cardHref(searchParams, row.project.id, undefined, boardBaseOf(pathname)))
      else router.push(row.href)
    },
    [pathname, remember, router, searchParams]
  )

  const stale = asked !== '' && results?.q !== asked
  const failed = asked !== '' && failedFor === asked
  const loading = stale && !failed

  // The Enter that came too early: the first row of the answer it was waiting for.
  useEffect(() => {
    const pending = pendingEnter.current
    if (!pending || stale || failed) return
    pendingEnter.current = null
    if (current) go(current, pending.newTab)
  }, [stale, failed, current, go])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      // The window's own: a card or a dialog under it stays open.
      e.preventDefault()
      e.stopPropagation()
      // A first Esc clears what was typed, the second closes.
      if (query) setQuery('')
      else close()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => moveActive(Math.min(a, rows.length - 1), rows.length, e.key === 'ArrowDown' ? 1 : -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (stale) pendingEnter.current = { newTab: e.metaKey || e.ctrlKey }
      else if (current) go(current, e.metaKey || e.ctrlKey)
    }
  }

  if (!mounted || !open) return null

  const groupTitle: Record<GroupKey, string> = {
    recent: t('groups.recent'),
    projects: t('groups.projects'),
    customers: t('groups.customers'),
    employees: t('groups.employees'),
    vehicles: t('groups.vehicles'),
    devices: t('groups.devices'),
    pages: asked ? t('groups.pages') : t('groups.quick'),
  }

  const waiting = asked !== '' && results === null && !failed
  const empty = asked !== '' && !waiting && !stale && rows.length === 0

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-3 pt-3 sm:px-4 sm:pt-[12vh]" onKeyDown={onKeyDown}>
      <button
        type="button"
        tabIndex={-1}
        aria-label={t('close')}
        onClick={close}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('title')}
        className="relative flex max-h-[min(36rem,calc(100dvh-1.5rem))] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          {loading ? (
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted" aria-hidden />
          ) : (
            <Search className="h-5 w-5 shrink-0 text-muted" aria-hidden />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
              pendingEnter.current = null
              if (!e.target.value.trim()) setResults(null)
            }}
            placeholder={t('placeholder')}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={current ? `${listId}-${current.id}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="go"
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted"
          />
          <button
            type="button"
            onClick={close}
            className="hidden rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted hover:bg-surface-hover sm:block"
          >
            Esc
          </button>
          <button type="button" onClick={close} className="rounded-md px-2 py-1 text-sm font-medium text-muted hover:bg-surface-hover sm:hidden">
            {t('cancel')}
          </button>
        </div>

        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={t('title')}
          aria-busy={stale}
          className={`flex-1 overflow-y-auto overscroll-contain p-2 transition-opacity ${stale && results ? 'opacity-60' : ''}`}
        >
          {failed && <p className="px-3 py-6 text-center text-sm text-danger">{t('failed')}</p>}
          {waiting && <p className="px-3 py-6 text-center text-sm text-muted">{t('searching')}</p>}
          {empty && <p className="px-3 py-6 text-center text-sm text-muted">{t('nothing', { query: query.trim() })}</p>}
          {rows.map((row, i) => {
            const first = i === 0 || rows[i - 1].group !== row.group
            const isActive = row === current
            const Icon = row.icon
            return (
              <div key={row.id}>
                {first && <p className="px-3 pb-1.5 pt-3 text-xs font-semibold text-muted first:pt-1">{groupTitle[row.group]}</p>}
                <a
                  href={row.href}
                  id={`${listId}-${row.id}`}
                  data-row={row.id}
                  role="option"
                  aria-selected={isActive}
                  onMouseMove={() => {
                    if (!isActive) setActive(i)
                  }}
                  onClick={(e) => {
                    // Middle click, ⌘ or Ctrl click: the browser opens its tab; the project is still remembered.
                    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
                      if (row.project) remember(row.project)
                      return
                    }
                    e.preventDefault()
                    go(row, false)
                  }}
                  className={`flex min-h-12 items-center gap-3 rounded-lg px-3 py-2 ${isActive ? 'bg-subtle' : ''}`}
                >
                  <span
                    aria-hidden
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border ${
                      isActive ? 'bg-surface text-accent' : 'bg-subtle text-muted'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{row.title}</span>
                    {row.meta && <span className="block truncate text-xs text-muted">{row.meta}</span>}
                  </span>
                  {row.aside && <span className="hidden shrink-0 text-xs tabular-nums text-muted sm:block">{row.aside}</span>}
                  {row.group === 'pages' && !row.aside && (
                    <ArrowRight className={`h-4 w-4 shrink-0 text-muted ${isActive ? '' : 'opacity-0'}`} aria-hidden />
                  )}
                  {row.group !== 'pages' && (
                    <CornerDownLeft className={`hidden h-4 w-4 shrink-0 text-muted sm:block ${isActive ? '' : 'opacity-0'}`} aria-hidden />
                  )}
                </a>
              </div>
            )
          })}
          {!asked && rows.length > 0 && recent.length === 0 && (
            <p className="px-3 pb-2 pt-3 text-xs text-muted">{t('emptyHint')}</p>
          )}
        </div>

        <div className="hidden items-center gap-4 border-t border-border px-4 py-2 text-xs text-muted sm:flex">
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> {t('hintMove')}
          </span>
          <span>
            <Kbd>↵</Kbd> {t('hintOpen')}
          </span>
          <span>
            <Kbd>{isMac() ? '⌘' : 'Ctrl'}</Kbd> <Kbd>↵</Kbd> {t('hintNewTab')}
          </span>
          <span className="ml-auto">
            <Kbd>Esc</Kbd> {t('hintClose')}
          </span>
        </div>
      </div>
    </div>,
    document.body
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-5 items-center justify-center rounded border border-border bg-subtle px-1 font-sans text-[11px] font-medium text-muted">
      {children}
    </kbd>
  )
}

function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
}

/** "⌘K" on a Mac, "Ctrl K" elsewhere — the same everywhere once the page is in the browser. */
export function useShortcutLabel(): string {
  const mounted = useMounted()
  return mounted && !isMac() ? 'Ctrl K' : '⌘K'
}

/**
 * The magnifier that opens the window. `field` draws it as a search box (the
 * sidebar's), `icon` as a square button (the phone's bar, the folded rail, a
 * page's head).
 */
export function SearchButton({ variant, className = '' }: { variant: 'field' | 'icon'; className?: string }) {
  const t = useTranslations('search')
  const shortcut = useShortcutLabel()
  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={openSearch}
        aria-label={t('open')}
        title={`${t('open')} (${shortcut})`}
        aria-keyshortcuts="Meta+K Control+K"
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground ${className}`}
      >
        <Search className="h-4 w-4" aria-hidden />
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={openSearch}
      aria-keyshortcuts="Meta+K Control+K"
      className={`flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 text-sm text-muted transition-colors hover:border-border-strong hover:text-foreground ${className}`}
    >
      <Search className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-left">{t('open')}</span>
      <Kbd>{shortcut}</Kbd>
    </button>
  )
}
