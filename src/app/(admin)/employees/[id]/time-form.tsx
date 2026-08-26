'use client'

import { useTranslations } from 'next-intl'
import { SavedForm, type SaveState } from '@/components/saved-form'
import { Select } from '@/components/ui/select'
import { btn } from '@/components/ui/button'

const inputClass =
  'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring'

/** Manual booking / correction from the office. */
export function TimeForm({
  action,
  projects,
}: {
  action: (formData: FormData) => Promise<SaveState>
  projects: Array<{ value: string; label: string }>
}) {
  const t = useTranslations('time')
  const tc = useTranslations('common')

  return (
    <SavedForm
      action={action}
      resetOnSave
      className="mt-4 space-y-3 border-t border-border pt-4"
      errorLabel={(code) => (code === 'invalidRange' ? t('invalidRange') : tc('saveFailed'))}
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block text-sm">
          {t('date')}
          <input type="date" name="date" required className={inputClass} />
        </label>
        <label className="block text-sm">
          {t('from')}
          <input type="time" name="from" required className={inputClass} />
        </label>
        <label className="block text-sm">
          {t('to')}
          <input type="time" name="to" required className={inputClass} />
        </label>
        <label className="block text-sm">
          {t('project')}
          <Select name="projectId" className="mt-1 w-full" defaultValue="">
            <option value="">{tc('none')}</option>
            {projects.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <div className="flex items-end gap-3">
        <label className="block flex-1 text-sm">
          {t('note')}
          <input name="note" className={inputClass} />
        </label>
        <button type="submit" className={btn.primarySm}>
          {t('add')}
        </button>
      </div>
    </SavedForm>
  )
}
