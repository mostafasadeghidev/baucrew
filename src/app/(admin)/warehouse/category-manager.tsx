'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { removeCategory, renameCategory, type CategoryState } from './actions'
import { SavedToast } from '@/components/saved-toast'
import { DeleteButton } from '@/components/delete-button'
import { btn } from '@/components/ui/button'

const inputClass =
  'block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent'

function CategoryRow({ name, count }: { name: string; count: number }) {
  const t = useTranslations('warehouse')
  const tc = useTranslations('common')
  const [state, action, pending] = useActionState<CategoryState, FormData>(renameCategory.bind(null, name), {})
  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-2">
      <form action={action} className="flex min-w-0 flex-1 items-center gap-2" key={name}>
        <input name="name" defaultValue={name} aria-label={t('renameCategory')} className={`${inputClass} min-w-40 max-w-xs`} />
        <span className="shrink-0 text-xs text-muted">{t('itemsCount', { count })}</span>
        <button
          type="submit"
          disabled={pending}
          className={btn.outlineSm}
        >
          {t('renameCategory')}
        </button>
        <SavedToast trigger={state.savedAt} />
        {state.error && (
          <span role="alert" className="text-xs text-danger">
            {state.error === 'nameRequired' ? t('categoryNameRequired') : tc('saveFailed')}
          </span>
        )}
      </form>
      <DeleteButton
        action={removeCategory.bind(null, name)}
        label={t('removeCategory')}
        confirmMessage={t('removeCategoryConfirm', { name, count })}
        errorLabels={{ saveFailed: tc('saveFailed') }}
      />
    </li>
  )
}

/** Collapsible "manage categories" box at the bottom of the warehouse page. */
export function CategoryManager({ categories }: { categories: Array<{ name: string; count: number }> }) {
  const t = useTranslations('warehouse')
  const [open, setOpen] = useState(false)
  return (
    <section className="rounded-lg border border-border bg-surface shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold">
          {t('categoriesTitle')}{' '}
          <span className="ml-1 rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium tabular-nums">
            {categories.length}
          </span>
        </span>
        <span aria-hidden className={`text-xs text-muted transition-transform ${open ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>
      {open && (
        <div className="border-t border-border">
          <p className="px-4 py-2 text-xs text-muted">{t('categoriesHint')}</p>
          {categories.length === 0 ? (
            <p className="px-4 pb-3 text-sm text-muted">{t('noCategories')}</p>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {categories.map((c) => (
                <CategoryRow key={c.name} name={c.name} count={c.count} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
