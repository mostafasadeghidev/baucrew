'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import type { ItemFormState } from './actions'
import { CategoryPicker } from '@/components/category-picker'
import { Select } from '@/components/ui/select'
import { FormHead } from '@/components/ui/form-head'

export type ItemFormValues = {
  kind: string
  name: string
  category: string
  unit: string
  stockQuantity: string
  minStock: string
  location: string
  videoUrl: string
  active: boolean
  notes: string
}

const inputClass =
  'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent'

export function ItemForm({
  action,
  initial,
  cancelHref,
  title,
  headExtra,
  categories = [],
  kinds,
}: {
  action: (prev: ItemFormState, formData: FormData) => Promise<ItemFormState>
  initial: ItemFormValues
  cancelHref: string
  /** The page's own name, shown in the bar above the fields. */
  title: string
  /** A control for the bar that belongs to the page, e.g. delete. */
  headExtra?: React.ReactNode
  /** Existing categories for live suggestions. */
  categories?: string[]
  /** Configured item kinds (Settings → Arbeitsbereiche). */
  kinds: Array<{ value: string; label: string }>
}) {
  const t = useTranslations('warehouse')
  const tc = useTranslations('common')
  const [state, formAction, pending] = useActionState<ItemFormState, FormData>(action, {})

  return (
    <form action={formAction} className="space-y-6">
      <FormHead
        title={title}
        saveLabel={tc('save')}
        cancelLabel={tc('cancel')}
        cancelHref={cancelHref}
        pending={pending}
        extra={headExtra}
      />
      <div className="max-w-3xl rounded-xl border border-border bg-surface p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="block text-sm font-medium">
              {t('name')} <span className="text-danger">*</span>
            </label>
            <input id="name" name="name" defaultValue={initial.name} required className={inputClass} />
          </div>
          <div>
            <label htmlFor="kind" className="block text-sm font-medium">
              {t('kind')}
            </label>
            <Select id="kind" name="kind" defaultValue={initial.kind} className="mt-1 w-full">
              {kinds.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          </div>
          <CategoryPicker name="category" label={t('category')} defaultValue={initial.category} categories={categories} />
          <div>
            <label htmlFor="unit" className="block text-sm font-medium">
              {t('unit')}
            </label>
            <input id="unit" name="unit" defaultValue={initial.unit} className={inputClass} />
          </div>
          <div>
            <label htmlFor="stockQuantity" className="block text-sm font-medium">
              {t('stock')}
            </label>
            <input
              id="stockQuantity"
              name="stockQuantity"
              type="text"
              inputMode="decimal"
              defaultValue={initial.stockQuantity}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="minStock" className="block text-sm font-medium">
              {t('minStock')}
            </label>
            <input
              id="minStock"
              name="minStock"
              type="text"
              inputMode="decimal"
              defaultValue={initial.minStock}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="location" className="block text-sm font-medium">
              {t('location')}
            </label>
            <input id="location" name="location" defaultValue={initial.location} className={inputClass} />
          </div>
          <div>
            <label htmlFor="videoUrl" className="block text-sm font-medium">
              {t('videoUrl')}
            </label>
            <input
              id="videoUrl"
              name="videoUrl"
              type="url"
              placeholder="https://…"
              defaultValue={initial.videoUrl}
              className={inputClass}
            />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                name="active"
                defaultChecked={initial.active}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              {tc('active')}
            </label>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="notes" className="block text-sm font-medium">
              {t('notes')}
            </label>
            <textarea id="notes" name="notes" rows={3} defaultValue={initial.notes} className={inputClass} />
          </div>
        </div>
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error === 'nameRequired' ? t('nameRequired') : tc('saveFailed')}
        </p>
      )}

    </form>
  )
}
