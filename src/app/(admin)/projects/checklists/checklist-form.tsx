'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { SavedForm, type SaveState } from '@/components/saved-form'
import { DeleteButton } from '@/components/delete-button'
import { btn } from '@/components/ui/button'

const inputClass =
  'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring'

const FORM_ID = 'checklist-form'

/** One site checklist: name, one point per line, active switch. */
export function ChecklistForm({
  action,
  initial,
  deleteAction,
}: {
  action: (formData: FormData) => Promise<SaveState>
  initial: { name: string; description: string; active: boolean; items: string[] }
  /** Only on the edit page. */
  deleteAction?: (prev: { error?: string }, formData: FormData) => Promise<{ error?: string }>
}) {
  const t = useTranslations('checklists')
  const tc = useTranslations('common')

  return (
    <div className="space-y-4">
      <SavedForm
        id={FORM_ID}
        action={action}
        className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-sm"
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <label className="block text-sm">
            {t('templateName')}
            <input name="name" defaultValue={initial.name} required autoFocus className={inputClass} />
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              name="active"
              defaultChecked={initial.active}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            {tc('active')}
          </label>
        </div>

        <label className="block text-sm">
          {t('templateDescription')}
          <input
            name="description"
            defaultValue={initial.description}
            placeholder={t('templateDescriptionHint')}
            className={inputClass}
          />
        </label>

        <label className="block text-sm">
          {t('templateItems')}
          <textarea
            name="items"
            rows={Math.min(20, Math.max(8, initial.items.length + 2))}
            defaultValue={initial.items.join('\n')}
            placeholder={t('templateItemsHint')}
            className={`${inputClass} font-mono text-xs`}
          />
        </label>
      </SavedForm>

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" form={FORM_ID} className={btn.primary}>
          {tc('save')}
        </button>
        <Link href="/projects/checklists" className={btn.outline}>
          {tc('cancel')}
        </Link>
        {deleteAction && (
          <span className="ml-auto">
            <DeleteButton
              action={deleteAction}
              label={tc('delete')}
              confirmMessage={`${initial.name} — ${tc('delete')}?`}
            />
          </span>
        )}
      </div>
    </div>
  )
}
