'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Combobox, type ComboboxOption } from '@/components/combobox'
import { addTemplateItem, removeTemplateItem } from '../actions'
import { btn } from '@/components/ui/button'

export type TemplateItemRow = {
  id: string
  name: string
  unit: string | null
  quantity: number | null
}

export function TemplateItemsEditor({
  templateId,
  items,
  options,
}: {
  templateId: string
  items: TemplateItemRow[]
  options: ComboboxOption[]
}) {
  const t = useTranslations('projects')
  const tWarehouse = useTranslations('warehouse')
  const tc = useTranslations('common')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [addKey, setAddKey] = useState(0)
  const [quantity, setQuantity] = useState('')

  function submitAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const catalogItemId = (form.elements.namedItem('catalogItemId') as HTMLInputElement)?.value
    if (!catalogItemId) return
    const qty = quantity.trim() ? Number(quantity.replace(',', '.')) : null
    setError(null)
    startTransition(async () => {
      const result = await addTemplateItem(templateId, catalogItemId, qty)
      if (result.error) {
        setError(result.error === 'itemAlreadyAdded' ? t('itemAlreadyAdded') : tc('saveFailed'))
      } else {
        setAddKey((k) => k + 1)
        setQuantity('')
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
                disabled={pending}
                onClick={() => startTransition(() => removeTemplateItem(templateId, item.id))}
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

      <form onSubmit={submitAdd} className="flex flex-wrap items-start gap-2 border-t border-border px-5 py-3">
        <div className="min-w-52 flex-1" key={addKey}>
          <Combobox
            name="catalogItemId"
            options={options}
            placeholder={t('selectItem')}
            noResultsLabel={tWarehouse('noResults')}
          />
        </div>
        <input
          type="text"
          inputMode="decimal"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder={t('quantity')}
          className="mt-1 w-24 rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="submit"
          disabled={pending}
          className={`${btn.primary} mt-1`}
        >
          {t('addItem')}
        </button>
        {error && (
          <p role="alert" className="w-full text-sm text-danger">
            {error}
          </p>
        )}
      </form>
    </div>
  )
}
