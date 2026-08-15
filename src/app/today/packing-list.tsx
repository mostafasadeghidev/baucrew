'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { setItemStatusFromBoard } from './actions'

export type PackingItem = {
  id: string
  name: string
  unit: string | null
  quantity: number | null
  status: 'REQUIRED' | 'COLLECTED' | 'MISSING'
}

export function PackingList({ items }: { items: PackingItem[] }) {
  const t = useTranslations('today')
  const [pending, startTransition] = useTransition()

  if (items.length === 0) {
    return <p className="px-5 py-4 text-lg text-muted">{t('noItems')}</p>
  }

  const done = items.filter((i) => i.status === 'COLLECTED').length
  const allPacked = done === items.length

  function toggleCollected(item: PackingItem) {
    const next = item.status === 'COLLECTED' ? 'REQUIRED' : 'COLLECTED'
    startTransition(() => setItemStatusFromBoard(item.id, next))
  }

  function toggleMissing(item: PackingItem) {
    const next = item.status === 'MISSING' ? 'REQUIRED' : 'MISSING'
    startTransition(() => setItemStatusFromBoard(item.id, next))
  }

  return (
    <div>
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.id} className="flex items-stretch gap-2 px-4 py-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => toggleCollected(item)}
              className={`flex min-h-16 flex-1 items-center gap-4 rounded-lg border-2 px-4 text-left transition-colors ${
                item.status === 'COLLECTED'
                  ? 'border-emerald-600/60 bg-emerald-500/15'
                  : item.status === 'MISSING'
                    ? 'border-red-600/60 bg-red-500/10'
                    : 'border-border bg-background hover:border-accent'
              }`}
            >
              <span
                aria-hidden
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border-2 text-xl font-bold ${
                  item.status === 'COLLECTED'
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : item.status === 'MISSING'
                      ? 'border-red-600 text-red-600'
                      : 'border-border'
                }`}
              >
                {item.status === 'COLLECTED' ? '✓' : item.status === 'MISSING' ? '!' : ''}
              </span>
              <span className="min-w-0">
                <span
                  className={`block truncate text-xl font-semibold ${
                    item.status === 'COLLECTED' ? 'line-through opacity-70' : ''
                  }`}
                >
                  {item.name}
                </span>
                {item.quantity != null && (
                  <span className="text-base text-muted">
                    {item.quantity}
                    {item.unit ? ` ${item.unit}` : ''}
                  </span>
                )}
              </span>
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => toggleMissing(item)}
              className={`min-w-20 rounded-lg border-2 px-3 text-base font-semibold transition-colors ${
                item.status === 'MISSING'
                  ? 'border-red-600 bg-red-600 text-white'
                  : 'border-border text-muted hover:border-red-600/60 hover:text-red-600'
              }`}
            >
              {t('statusMissing')}
            </button>
          </li>
        ))}
      </ul>
      <div
        className={`m-4 rounded-lg px-4 py-3 text-center text-xl font-bold tracking-wide ${
          allPacked
            ? 'bg-emerald-600 text-white'
            : 'bg-surface-hover text-muted'
        }`}
      >
        {allPacked ? `✓ ${t('allPacked')}` : t('packedCount', { done, total: items.length })}
      </div>
    </div>
  )
}
