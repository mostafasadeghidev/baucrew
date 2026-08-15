'use client'

import { useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Combobox, type ComboboxOption } from '@/components/combobox'
import { addProjectItem, removeProjectItem, setProjectItemStatus } from '../actions'

export type ProjectItemRow = {
  id: string
  name: string
  unit: string | null
  quantity: number | null
  status: 'REQUIRED' | 'COLLECTED' | 'MISSING'
}

const ITEM_STATUSES = ['REQUIRED', 'COLLECTED', 'MISSING'] as const

export function ProjectItemsEditor({
  projectId,
  items,
  options,
  onChanged,
}: {
  projectId: string
  items: ProjectItemRow[]
  /** Active catalog items not yet assigned to this project. */
  options: ComboboxOption[]
  /** Called after any successful change (used when embedded in a dialog). */
  onChanged?: () => void
}) {
  const t = useTranslations('projects')
  const tc = useTranslations('common')
  const tStatus = useTranslations('itemStatus')
  const tWarehouse = useTranslations('warehouse')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Remount the combobox after each add so it clears its input.
  const [addKey, setAddKey] = useState(0)
  const [selectedId, setSelectedId] = useState('')
  const [quantity, setQuantity] = useState('')

  const addRowRef = useRef<HTMLDivElement>(null)

  function submitAdd() {
    const catalogItemId =
      addRowRef.current?.querySelector<HTMLInputElement>('input[name="catalogItemId"]')?.value ?? ''
    if (!catalogItemId) return
    const qty = quantity.trim() ? Number(quantity.replace(',', '.')) : null
    setError(null)
    startTransition(async () => {
      const result = await addProjectItem(projectId, catalogItemId, qty)
      if (result.error) {
        setError(result.error === 'itemAlreadyAdded' ? t('itemAlreadyAdded') : tc('saveFailed'))
      } else {
        setAddKey((k) => k + 1)
        setSelectedId('')
        setQuantity('')
        onChanged?.()
      }
    })
  }

  return (
    <div>
      {items.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">{t('noItems')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
              <span className="min-w-0">
                {item.name}
                {item.quantity != null && (
                  <span className="ml-2 text-xs text-muted">
                    {t('quantity')}: {item.quantity}
                    {item.unit ? ` ${item.unit}` : ''}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <select
                  value={item.status}
                  disabled={pending}
                  onChange={(e) =>
                    startTransition(async () => {
                      await setProjectItemStatus(projectId, item.id, e.target.value)
                      onChanged?.()
                    })
                  }
                  className={`rounded-md border border-border bg-background px-2 py-1 text-xs font-medium focus:border-accent focus:outline-none ${
                    item.status === 'COLLECTED'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : item.status === 'MISSING'
                        ? 'text-red-700 dark:text-red-400'
                        : ''
                  }`}
                >
                  {ITEM_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {tStatus(s)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await removeProjectItem(projectId, item.id)
                      onChanged?.()
                    })
                  }
                  title={t('removeItem')}
                  aria-label={t('removeItem')}
                  className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:bg-danger/10 hover:text-danger"
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div ref={addRowRef} className="flex flex-wrap items-start gap-2 border-t border-border px-5 py-3">
        <div className="min-w-52 flex-1" key={addKey}>
          <Combobox
            name="catalogItemId"
            options={options}
            defaultValue={selectedId}
            placeholder={t('selectItem')}
            noResultsLabel={tWarehouse('noResults')}
          />
        </div>
        <input
          type="text"
          inputMode="decimal"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submitAdd()
            }
          }}
          placeholder={t('quantity')}
          className="mt-1 w-24 rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="button"
          disabled={pending}
          onClick={submitAdd}
          className="mt-1 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
        >
          {t('addItem')}
        </button>
        {error && (
          <p role="alert" className="w-full text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
