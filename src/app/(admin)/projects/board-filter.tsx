'use client'

/**
 * The filter above the board, the way Trello narrows a board: one person (as
 * site manager or in the team), one trade, or only the urgent jobs. Each
 * choice lives in the address like the search does, so it survives a reload
 * and follows the office from one board to the next.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Check, SlidersHorizontal } from 'lucide-react'
import { Menu, MenuSeparator, menuItemClass } from '@/components/ui/menu'
import { btn } from '@/components/ui/button'
import { boardFilterCount, type BoardFilter } from '@/lib/board-cards'

type Option = { id: string; name: string }

export function BoardFilter({ people, labels, current }: { people: Option[]; labels: Option[]; current: BoardFilter }) {
  const t = useTranslations('projects')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const count = boardFilterCount(current)

  const write = (changes: Partial<Record<'member' | 'label' | 'urgent', string | null>>) => {
    const params = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    params.delete('page')
    const qs = params.toString()
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }

  const heading = (text: string) => (
    <div className="px-2 pb-0.5 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">{text}</div>
  )
  const item = (on: boolean, label: string, onPick: () => void, role: 'menuitemradio' | 'menuitemcheckbox' = 'menuitemradio') => (
    <button type="button" role={role} aria-checked={on} onClick={onPick} className={menuItemClass}>
      <Check aria-hidden className={`h-3.5 w-3.5 shrink-0 text-accent ${on ? '' : 'invisible'}`} />
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
      <div className="max-h-[70vh] w-56 overflow-y-auto">
        {people.length > 0 && (
          <>
            {heading(t('boardFilterMember'))}
            {people.map((p) => (
              <div key={p.id}>{item(current.member === p.id, p.name, () => write({ member: current.member === p.id ? null : p.id }))}</div>
            ))}
            <MenuSeparator />
          </>
        )}
        {labels.length > 0 && (
          <>
            {heading(t('boardFilterLabel'))}
            {labels.map((l) => (
              <div key={l.id}>{item(current.label === l.id, l.name, () => write({ label: current.label === l.id ? null : l.id }))}</div>
            ))}
            <MenuSeparator />
          </>
        )}
        {item(current.urgent, t('boardFilterUrgent'), () => write({ urgent: current.urgent ? null : '1' }), 'menuitemcheckbox')}
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
