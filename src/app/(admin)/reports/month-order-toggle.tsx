'use client'

import { ArrowDown01, ArrowDown10 } from 'lucide-react'
import { useParamUpdater } from '@/components/live-search'
import { btn } from '@/components/ui/button'

/**
 * The months' order as one button rather than a menu of two: a click turns
 * it round. The icon shows which way the months run now — 0→1 first month
 * first, 1→0 last month first — and its name says it in words.
 */
export function MonthOrderToggle({
  descending,
  labels,
}: {
  descending: boolean
  labels: { asc: string; desc: string }
}) {
  const update = useParamUpdater()
  const now = descending ? labels.desc : labels.asc
  return (
    <button
      type="button"
      onClick={() => update('order', descending ? '' : 'desc')}
      aria-pressed={descending}
      aria-label={now}
      title={now}
      className={btn.icon}
    >
      {descending ? <ArrowDown10 aria-hidden className="h-4 w-4" /> : <ArrowDown01 aria-hidden className="h-4 w-4" />}
    </button>
  )
}
