'use client'

import { useActionState } from 'react'
import { SavedToast } from '@/components/saved-toast'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Combobox, type ComboboxOption } from '@/components/combobox'
import type { TemplateFormState } from './actions'

export type TemplateFormValues = {
  name: string
  workCategoryId: string
  description: string
  active: boolean
}

const inputClass =
  'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent'

export function TemplateForm({
  action,
  initial,
  categories,
}: {
  action: (prev: TemplateFormState, formData: FormData) => Promise<TemplateFormState>
  initial: TemplateFormValues
  categories: ComboboxOption[]
}) {
  const t = useTranslations('templates')
  const tc = useTranslations('common')
  const [state, formAction, pending] = useActionState<TemplateFormState, FormData>(action, {})

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="block text-sm font-medium">
              {t('name')} <span className="text-danger">*</span>
            </label>
            <input id="name" name="name" defaultValue={initial.name} required className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium">{t('category')}</label>
            <Combobox
              name="workCategoryId"
              options={categories}
              defaultValue={initial.workCategoryId}
              placeholder={tc('none')}
              noResultsLabel={t('noResults')}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="description" className="block text-sm font-medium">
              {t('description')}
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={initial.description}
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
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
        </div>
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error === 'nameRequired' ? t('nameRequired') : tc('saveFailed')}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
        >
          {tc('save')}
        </button>
        <Link
          href="/projects/templates"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface-hover"
        >
          {tc('cancel')}
        </Link>
        <SavedToast trigger={state.savedAt} />
      </div>
    </form>
  )
}
