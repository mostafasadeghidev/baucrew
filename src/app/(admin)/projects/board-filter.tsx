'use client'

/**
 * The filter above the board, the way Trello narrows a board: one person (as
 * site manager or in the team), one trade, or only the urgent jobs. Each
 * choice lives in the address like the search does, so it survives a reload
 * and follows the office from one board to the next.
 *
 * The lists are searched as they are typed into: the box on top takes the
 * keyboard the moment the menu opens, narrows people and trades with every
 * letter, and Enter takes the first of what is left.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Search, SlidersHorizontal } from 'lucide-react'
import { Menu, MenuSeparator, menuItemClass } from '@/components/ui/menu'
import { btn } from '@/components/ui/button'
import { boardFilterCount, type BoardFilter } from '@/lib/board-cards'
import { LABEL_BAR } from '@/components/swatches'

type Option = { id: string; name: string; /** A trade's colour, as an index into the label palette. */ swatch?: number }

export function BoardFilter({ people, labels, current }: { people: Option[]; labels: Option[]; current: BoardFilter }) {
  const t = useTranslations('projects')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const [query, setQuery] = useState('')
  const count = boardFilterCount(current)

  const q = query.trim().toLowerCase()
  const match = (option: Option) => !q || option.name.toLowerCase().includes(q)
  const shownPeople = people.filter(match)
  const shownLabels = labels.filter(match)
  const urgentShown = !q || t('boardFilterUrgent').toLowerCase().includes(q)

  const write = (changes: Partial<Record<'member' | 'label' | 'urgent', string | null>>) => {
    const params = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    params.delete('page')
    const qs = params.toString()
    setQuery('')
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }

  const pickMember = (id: string) => write({ member: current.member === id ? null : id })
  const pickLabel = (id: string) => write({ label: current.label === id ? null : id })

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      // Into the list, where the arrows walk the items.
      e.preventDefault()
      e.currentTarget.closest('[role="menu"]')?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus()
      return
    }
    if (e.key === 'Enter' && q) {
      e.preventDefault()
      if (shownPeople[0]) pickMember(shownPeople[0].id)
      else if (shownLabels[0]) pickLabel(shownLabels[0].id)
      // The menu closes on a click; an Enter has to say so itself.
      e.currentTarget.closest<HTMLElement>('[role="menu"]')?.click()
    }
  }

  const heading = (text: string) => (
    <div className="px-2 pb-0.5 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">{text}</div>
  )
  const item = (
    on: boolean,
    label: string,
    onPick: () => void,
    role: 'menuitemradio' | 'menuitemcheckbox' = 'menuitemradio',
    swatch?: number
  ) => (
    <button type="button" role={role} aria-checked={on} onClick={onPick} className={menuItemClass}>
      <Check aria-hidden className={`h-3.5 w-3.5 shrink-0 text-accent ${on ? '' : 'invisible'}`} />
      {swatch !== undefined && <span aria-hidden className={`h-2 w-5 shrink-0 rounded-full ${LABEL_BAR[swatch]}`} />}
      <span className="truncate">{label}</span>
    </button>
  )

  return (
    <Menu
      side="bottom"
      align="start"
      label={count > 0 ? `${t('boardFilter')}: ${count}` : t('boardFilter')}
      className={`${btn.outlineSm} shrink-0 gap-1.5 text-xs print:hidden`}
      trigger={
        <>
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
          {t('boardFilter')}
          {count > 0 && (
            <span className="rounded-full bg-accent/10 px-1.5 text-xs tabular-nums text-accent">{count}</span>
          )}
        </>
      }
    >
      <div className="w-60">
        {/* A click into the box is not a choice: the menu stays open. */}
        <div onClick={(e) => e.stopPropagation()} className="relative p-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder={t('boardFilterSearch')}
            aria-label={t('boardFilterSearch')}
            className="block w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {shownPeople.length > 0 && (
            <>
              {heading(t('boardFilterMember'))}
              {shownPeople.map((p) => (
                <div key={p.id}>{item(current.member === p.id, p.name, () => pickMember(p.id))}</div>
              ))}
            </>
          )}
          {shownLabels.length > 0 && (
            <>
              {shownPeople.length > 0 && <MenuSeparator />}
              {heading(t('boardFilterLabel'))}
              {shownLabels.map((l) => (
                <div key={l.id}>{item(current.label === l.id, l.name, () => pickLabel(l.id), 'menuitemradio', l.swatch)}</div>
              ))}
            </>
          )}
          {urgentShown && (
            <>
              {(shownPeople.length > 0 || shownLabels.length > 0) && <MenuSeparator />}
              {item(current.urgent, t('boardFilterUrgent'), () => write({ urgent: current.urgent ? null : '1' }), 'menuitemcheckbox')}
            </>
          )}
          {shownPeople.length === 0 && shownLabels.length === 0 && !urgentShown && (
            <p className="px-2 py-3 text-sm text-muted">{t('noResults')}</p>
          )}
        </div>
        {count > 0 && (
          <>
            <MenuSeparator />
            <button
              type="button"
              role="menuitem"
              onClick={() => write({ member: null, label: null, urgent: null })}
              className={`${menuItemClass} text-accent`}
            >
              {t('boardFilterReset')}
            </button>
          </>
        )}
      </div>
    </Menu>
  )
}
