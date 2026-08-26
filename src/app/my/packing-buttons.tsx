'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Circle, PlayCircle, TriangleAlert } from 'lucide-react'
import { setMyItemStatus } from './actions'

export type MyItem = {
  id: string
  name: string
  unit: string | null
  quantity: number | null
  status: 'REQUIRED' | 'COLLECTED' | 'MISSING'
  /** Short "how to operate this device" video, opened next to the tick button. */
  videoUrl?: string | null
}

const NEXT: Record<MyItem['status'], MyItem['status']> = {
  REQUIRED: 'COLLECTED',
  COLLECTED: 'MISSING',
  MISSING: 'REQUIRED',
}

/**
 * Packing list on the phone: one big tap target per item that cycles
 * required → packed → missing. Optimistic, so it feels instant on site.
 */
export function PackingList({ items }: { items: MyItem[] }) {
  const t = useTranslations('my')
  const tStatus = useTranslations('itemStatus')
  const [pending, startTransition] = useTransition()
  const [local, setLocal] = useState<Record<string, MyItem['status']>>({})
  const [error, setError] = useState<string | null>(null)

  const statusOf = (item: MyItem) => local[item.id] ?? item.status

  function toggle(item: MyItem) {
    const next = NEXT[statusOf(item)]
    setLocal((prev) => ({ ...prev, [item.id]: next }))
    setError(null)
    startTransition(async () => {
      const res = await setMyItemStatus(item.id, next)
      if (res.error) {
        setLocal((prev) => ({ ...prev, [item.id]: item.status }))
        setError(t('packingNotAllowed'))
      }
    })
  }

  return (
    <div>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => {
          const status = statusOf(item)
          return (
            <li key={item.id} className="flex items-stretch gap-1.5">
              {item.videoUrl && (
                <a
                  href={item.videoUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t('itemVideo', { name: item.name })}
                  className="order-2 flex shrink-0 items-center rounded-lg border border-border bg-surface px-3 text-accent"
                >
                  <PlayCircle className="h-5 w-5" aria-hidden />
                </a>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() => toggle(item)}
                aria-label={`${item.name} — ${tStatus(status)}`}
                className={`order-1 flex w-full min-w-0 items-center gap-3 rounded-lg border px-3 py-3 text-left text-base transition-colors disabled:opacity-70 ${
                  status === 'COLLECTED'
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                    : status === 'MISSING'
                      ? 'border-red-500/50 bg-red-500/10 text-red-800 dark:text-red-300'
                      : 'border-border bg-surface'
                }`}
              >
                <span aria-hidden className="shrink-0">
                  {status === 'COLLECTED' ? (
                    <Check className="h-5 w-5" />
                  ) : status === 'MISSING' ? (
                    <TriangleAlert className="h-5 w-5" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block font-medium ${status === 'COLLECTED' ? 'line-through opacity-80' : ''}`}>
                    {item.name}
                  </span>
                  {item.quantity != null && (
                    <span className="block text-sm opacity-70">
                      {item.quantity}
                      {item.unit ? ` ${item.unit}` : ''}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs font-medium uppercase tracking-wide opacity-70">
                  {tStatus(status)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 text-xs text-muted">{t('packingHint')}</p>
      {error && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
