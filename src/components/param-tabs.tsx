'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { TabLink, TabsList } from './ui/tabs'

export type ParamTab = { value: string; label: string; count?: number }

/**
 * Tab bar bound to an arbitrary query param (default `tab`). The first tab is
 * the default (empty value). Other query params are preserved.
 */
export function ParamTabs({
  tabs,
  param = 'tab',
  ariaLabel,
}: {
  tabs: ParamTab[]
  param?: string
  ariaLabel?: string
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const current = searchParams.get(param) ?? ''

  function hrefFor(value: string) {
    const params = new URLSearchParams(searchParams)
    if (value) params.set(param, value)
    else params.delete(param)
    params.delete('page')
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  return (
    <TabsList ariaLabel={ariaLabel}>
      {tabs.map((tab) => (
        <TabLink
          key={tab.value || '__default'}
          href={hrefFor(tab.value)}
          active={tab.value === current}
          label={tab.label}
          count={tab.count}
        />
      ))}
    </TabsList>
  )
}
