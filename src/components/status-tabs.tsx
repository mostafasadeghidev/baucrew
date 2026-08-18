'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { TabLink, TabsList } from './ui/tabs'

export type StatusTab = { value: string; label: string; count: number }

/** Tab bar bound to the `status` query param; preserves other filters, resets page. */
export function StatusTabs({ tabs, allLabel, allCount }: { tabs: StatusTab[]; allLabel: string; allCount: number }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const current = searchParams.get('status') ?? ''

  function hrefFor(value: string) {
    const params = new URLSearchParams(searchParams)
    if (value) params.set('status', value)
    else params.delete('status')
    params.delete('page')
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  const items: StatusTab[] = [{ value: '', label: allLabel, count: allCount }, ...tabs]

  return (
    <TabsList ariaLabel="Status">
      {items.map((tab) => (
        <TabLink
          key={tab.value || 'all'}
          href={hrefFor(tab.value)}
          active={tab.value === current}
          label={tab.label}
          count={tab.count}
        />
      ))}
    </TabsList>
  )
}
