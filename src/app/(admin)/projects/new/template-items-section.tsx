'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Combobox, type ComboboxOption } from '@/components/combobox'
import { QuickItemModal } from '@/components/quick-item-modal'
import { btn } from '@/components/ui/button'

export type DraftItem = { catalogItemId: string; name: string; unit: string | null; quantity: number | null }

/**
 * Collapsed by default: shows the tools/materials that will be copied from the
 * template into the new project. The user can remove items or add more before
 * saving. The final list is submitted as a hidden JSON field (`items`).
 */
export function TemplateItemsSection({
  initialItems,
  options,
  fromTemplate = false,
  defaultOpen = false,
}: {
  initialItems: DraftItem[]
  options: ComboboxOption[]
  /** True when the list was prefilled from a template (changes title/hint). */
  fromTemplate?: boolean
  /** Start expanded (new template page). */
  defaultOpen?: boolean
}) {
  const t = useTranslations('projects')
  const tT = useTranslations('templates')
  const tW = useTranslations('warehouse')
  const [items, setItems] = useState<DraftItem[]>(initialItems)
  const [open, setOpen] = useState(defaultOpen)
  const [addKey, setAddKey] = useState(0)
  const [pick, setPick] = useState('')
  const [qty, setQty] = useState('')
  const [dup, setDup] = useState(false)
  const [newItemName, setNewItemName] = useState<string | null>(null)
  const [extraOptions, setExtraOptions] = useState<ComboboxOption[]>([])

  const allOptions = [...options, ...extraOptions]
  const optionMap = new Map(allOptions.map((o) => [o.value, o.label]))

  function add() {
    if (!pick) return
    if (items.some((i) => i.catalogItemId === pick)) {
      setDup(true)
      return
    }
    const q = qty.trim() ? Number(qty.replace(',', '.')) : null
    setItems((prev) => [
      ...prev,
      { catalogItemId: pick, name: optionMap.get(pick) ?? pick, unit: null, quantity: Number.isFinite(q) ? q : null },
    ])
    setPick('')
    setQty('')
    setDup(false)
    setAddKey((k) => k + 1)
  }

  return (
    <div className="rounded-lg border border-border bg-surface shadow-sm">
      <input
        type="hidden"
        name="items"
        value={JSON.stringify(items.map((i) => ({ catalogItemId: i.catalogItemId, quantity: i.quantity })))}
      />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <span className="text-sm font-semibold">
          {fromTemplate ? tT('itemsTitle') : t('itemsTitle')}{' '}
          <span className="ml-1 rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium tabular-nums">
            {items.length}
          </span>
        </span>
        <span className="flex items-center gap-2 text-xs text-muted">
          {fromTemplate ? tT('itemsFromTemplateHint') : t('itemsNewHint')}
          <span aria-hidden className={`transition-transform ${open ? 'rotate-180' : ''}`}>
            ▾
          </span>
        </span>
      </button>

      {open && (
        <div className="border-t border-border">
          {items.length === 0 ? (
            <p className="px-5 py-3 text-sm text-muted">{t('noItems')}</p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((item) => (
                <li key={item.catalogItemId} className="flex items-center justify-between gap-3 px-5 py-2 text-sm">
                  <span>
                    {item.name}
                    {item.quantity != null && (
                      <span className="ml-2 text-xs text-muted">
                        {t('quantity')}: {item.quantity}
                        {item.unit ? ` ${item.unit}` : ''}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setItems((prev) => prev.filter((i) => i.catalogItemId !== item.catalogItemId))}
                    title={t('removeItem')}
                    aria-label={t('removeItem')}
                    className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:bg-danger/10 hover:text-danger"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-start gap-2 border-t border-border px-5 py-3">
            <div className="min-w-52 flex-1" key={addKey}>
              <Combobox
                name="_pickItem"
                options={allOptions}
                placeholder={t('selectItem')}
                noResultsLabel={tW('noResults')}
                onSelect={(v) => {
                  setPick(v)
                  setDup(false)
                }}
                onCreateNew={(name) => setNewItemName(name)}
                createLabel={(name) => `+ ${tW('createItemOption', { name })}`}
              />
            </div>
            <input
              type="text"
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder={t('quantity')}
              className="mt-1 w-24 rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button
              type="button"
              onClick={add}
              disabled={!pick}
              className={`${btn.outline} mt-1`}
            >
              {t('addItem')}
            </button>
            {dup && (
              <p role="alert" className="w-full text-sm text-danger">
                {t('itemAlreadyAdded')}
              </p>
            )}
          </div>
        </div>
      )}

      {newItemName !== null && (
        <QuickItemModal
          initialName={newItemName}
          onCreated={(item) => {
            // New catalog entries are not in `options` yet — keep them locally.
            setExtraOptions((prev) => [...prev, { value: item.id, label: item.label }])
            const q = qty.trim() ? Number(qty.replace(',', '.')) : null
            setItems((prev) =>
              prev.some((i) => i.catalogItemId === item.id)
                ? prev
                : [...prev, { catalogItemId: item.id, name: item.label, unit: null, quantity: Number.isFinite(q) ? q : null }]
            )
            setQty('')
            setPick('')
            setAddKey((k) => k + 1)
          }}
          onClose={() => setNewItemName(null)}
        />
      )}
    </div>
  )
}
