'use client'

/**
 * The filter above the board, the way Trello's filter window asks: people —
 * none, the reader's own cards, or any of several —, the card's status (ticked
 * done or not), when it is due, labels — none, "Hoch" or any of several
 * trades —, and how lately anything happened on it. Every tick narrows the
 * board at once and the window stays open for the next; each choice lives in
 * the address like the search does, so it survives a reload and follows the
 * office from one board to the next.
 *
 * The box on top narrows the people and the labels as it is typed into.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Search, SlidersHorizontal } from 'lucide-react'
import { btn } from '@/components/ui/button'
import { Popover, PopoverHead } from '@/components/ui/popover'
import { ACTIVITY_FILTERS, boardFilterCount, DUE_FILTERS, type ActivityFilter, type BoardFilter, type DueFilter } from '@/lib/board-cards'
import { LABEL_BAR, URGENT_LABEL } from '@/components/swatches'

type Option = { id: string; name: string; /** A trade's colour, as an index into the label palette. */ swatch?: number }

type Changes = Partial<Record<'member' | 'label' | 'urgent' | 'due' | 'done' | 'activity', string | null>>

export function BoardFilter({
  people,
  labels,
  current,
  canMe,
}: {
  people: Option[]
  labels: Option[]
  current: BoardFilter
  /** Whether the reader has a person behind the account — "Mir zugewiesene Karten". */
  canMe: boolean
}) {
  const t = useTranslations('projects')
  const tc = useTranslations('common')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const close = useCallback(() => setOpen(false), [])
  const count = boardFilterCount(current)

  const write = (changes: Changes) => {
    const params = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    params.delete('page')
    const qs = params.toString()
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }
  /** One value in or out of a list kept as "a,b" in the address. */
  const flip = (list: string[], value: string) => {
    const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
    return next.length > 0 ? next.join(',') : null
  }

  const q = query.trim().toLowerCase()
  const match = (name: string) => !q || name.toLowerCase().includes(q)
  const dueLabel: Record<DueFilter, string> = {
    none: t('boardFilterDueNone'),
    overdue: t('boardFilterDueOverdue'),
    week: t('boardFilterDueWeek'),
    month: t('boardFilterDueMonth'),
  }
  const activityLabel: Record<ActivityFilter, string> = {
    '1w': t('boardFilterActive1w'),
    '2w': t('boardFilterActive2w'),
    '4w': t('boardFilterActive4w'),
    stale: t('boardFilterStale'),
  }

  const heading = (text: string) => <p className="mb-1 mt-3 text-[11px] font-semibold text-muted first:mt-0">{text}</p>
  const row = (on: boolean, label: React.ReactNode, onPick: () => void, key: string) => (
    <label key={key} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-surface-hover">
      <input type="checkbox" checked={on} onChange={onPick} className="h-4 w-4 shrink-0 accent-[var(--accent)]" />
      <span className="flex min-w-0 flex-1 items-center gap-2">{label}</span>
    </label>
  )

  const shownPeople = people.filter((p) => match(p.name))
  const shownLabels = labels.filter((l) => match(l.name))

  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={count > 0 ? `${t('boardFilter')}: ${count}` : t('boardFilter')}
        // Its own text colour, see the year picker: white on the board's white button was nothing.
        className={`${btn.outlineSm} shrink-0 gap-1.5 text-xs text-foreground print:hidden`}
      >
        <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
        {t('boardFilter')}
        {count > 0 && <span className="rounded-full bg-accent/10 px-1.5 text-xs tabular-nums text-accent">{count}</span>}
      </button>
      <Popover open={open} onClose={close} anchor={anchor} label={t('boardFilter')} width={320}>
        <PopoverHead title={t('boardFilter')} close={close} closeLabel={tc('close')} />
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('boardFilterSearch')}
            aria-label={t('boardFilterSearch')}
            className="block w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="mt-3">
          {heading(t('boardFilterMember'))}
          {!q && row(current.members.includes('none'), t('boardFilterNoMembers'), () => write({ member: flip(current.members, 'none') }), 'member-none')}
          {!q && canMe && row(current.members.includes('me'), t('boardFilterMe'), () => write({ member: flip(current.members, 'me') }), 'member-me')}
          <div className="max-h-44 overflow-y-auto">
            {shownPeople.map((p) => row(current.members.includes(p.id), <span className="truncate">{p.name}</span>, () => write({ member: flip(current.members, p.id) }), `member-${p.id}`))}
          </div>

          {!q && (
            <>
              {heading(t('boardFilterStatus'))}
              {row(current.done === true, t('boardFilterDone'), () => write({ done: current.done === true ? null : '1' }), 'status-done')}
              {row(current.done === false, t('boardFilterNotDone'), () => write({ done: current.done === false ? null : '0' }), 'status-open')}

              {heading(t('boardFilterDue'))}
              {DUE_FILTERS.map((due) => row(current.due === due, dueLabel[due], () => write({ due: current.due === due ? null : due }), `due-${due}`))}
            </>
          )}

          {heading(t('boardFilterLabel'))}
          {!q && row(current.labels.includes('none'), t('boardFilterNoLabels'), () => write({ label: flip(current.labels, 'none') }), 'label-none')}
          {match(t('boardFilterUrgent')) &&
            row(
              current.urgent,
              <span className={`flex h-6 min-w-0 flex-1 items-center truncate rounded px-2 text-xs font-medium ${URGENT_LABEL.pill}`}>{t('boardFilterUrgent')}</span>,
              () => write({ urgent: current.urgent ? null : '1' }),
              'label-urgent'
            )}
          <div className="max-h-44 overflow-y-auto">
            {shownLabels.map((l) =>
              row(
                current.labels.includes(l.id),
                <>
                  {l.swatch !== undefined && <span aria-hidden className={`h-2.5 w-8 shrink-0 rounded-full ${LABEL_BAR[l.swatch]}`} />}
                  <span className="truncate">{l.name}</span>
                </>,
                () => write({ label: flip(current.labels, l.id) }),
                `label-${l.id}`
              )
            )}
          </div>

          {!q && (
            <>
              {heading(t('boardFilterActivity'))}
              {ACTIVITY_FILTERS.map((a) => row(current.activity === a, activityLabel[a], () => write({ activity: current.activity === a ? null : a }), `activity-${a}`))}
            </>
          )}
          {q && shownPeople.length === 0 && shownLabels.length === 0 && !match(t('boardFilterUrgent')) && (
            <p className="px-1.5 py-2 text-sm text-muted">{t('noResults')}</p>
          )}
        </div>
        {count > 0 && (
          <button
            type="button"
            onClick={() => write({ member: null, label: null, urgent: null, due: null, done: null, activity: null })}
            className="mt-3 w-full rounded-md bg-subtle px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-surface-hover"
          >
            {t('boardFilterReset')}
          </button>
        )}
      </Popover>
    </>
  )
}
