'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Combobox, type ComboboxOption } from '@/components/combobox'
import { addProjectItem, removeProjectItem, setProjectItemStatus } from '../actions'
import { StockWarning } from '@/components/stock-warning'
import { QuickItemModal } from '@/components/quick-item-modal'
import { Select } from '@/components/ui/select'
import { btn } from '@/components/ui/button'

export type ProjectItemRow = {
  id: string
  name: string
  unit: string | null
  quantity: number | null
  /** Warehouse stock (null = unknown) — for the shortage warning. */
  stock: number | null
  status: 'REQUIRED' | 'COLLECTED' | 'MISSING'
}

const ITEM_STATUSES = ['REQUIRED', 'COLLECTED', 'MISSING'] as const

export function ProjectItemsEditor({
  projectId,
  items,
  options,
  onChanged,
  pending: externalPending = false,
}: {
  projectId: string
  items: ProjectItemRow[]
  /** Active catalog items not yet assigned to this project. */
  options: ComboboxOption[]
  /** Called after any successful change (used when embedded in a dialog). */
  onChanged?: () => void
  /** The parent is reloading the list (dialog) — disables the controls. */
  pending?: boolean
}) {
  const t = useTranslations('projects')
  const tc = useTranslations('common')
  const tStatus = useTranslations('itemStatus')
  const tWarehouse = useTranslations('warehouse')
  const [ownPending, startTransition] = useTransition()
  const pending = ownPending || externalPending
  const [error, setError] = useState<string | null>(null)
  // Remount the combobox after each add so it clears its input.
  const [addKey, setAddKey] = useState(0)
  const [selectedId, setSelectedId] = useState('')
  const [quantity, setQuantity] = useState('')
  // Name typed into the picker that is not in the catalog yet → quick-create dialog.
  const [newItemName, setNewItemName] = useState<string | null>(null)
  // Ref (not state) so the effect below stays side-effect only.
  const scrollAfterAdd = useRef(false)

  const addRowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!scrollAfterAdd.current) return
    scrollAfterAdd.current = false
    addRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [items.length])

  /** Adds a catalog item to the project (shared by the picker and the quick-create dialog). */
  function addById(catalogItemId: string) {
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
        scrollAddRowIntoView()
      }
    })
  }

  /**
   * After adding, scroll the picker back into view. The list is re-rendered by
   * the server action, so the scroll has to wait for the new items — hence the
   * effect below on `items.length` instead of scrolling inside the handler.
   */
  function scrollAddRowIntoView() {
    scrollAfterAdd.current = true
  }

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
        scrollAddRowIntoView()
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
                {item.status !== 'COLLECTED' && (
                  <span className="ml-2">
                    <StockWarning needed={item.quantity} stock={item.stock} unit={item.unit} />
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <Select
                  compact
                  value={item.status}
                  disabled={pending}
                  onChange={(e) =>
                    startTransition(async () => {
                      await setProjectItemStatus(projectId, item.id, e.target.value)
                      onChanged?.()
                    })
                  }
                  className={`w-auto min-w-28 ${
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
                </Select>
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
            onCreateNew={(name) => setNewItemName(name)}
            createLabel={(name) => `+ ${tWarehouse('createItemOption', { name })}`}
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
          className={`${btn.primary} mt-1`}
        >
          {t('addItem')}
        </button>
        {error && (
          <p role="alert" className="w-full text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      {newItemName !== null && (
        <QuickItemModal
          initialName={newItemName}
          onCreated={(item) => addById(item.id)}
          onClose={() => setNewItemName(null)}
        />
      )}
    </div>
  )
}
