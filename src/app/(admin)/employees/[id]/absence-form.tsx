'use client'

import { useTranslations } from 'next-intl'
import { SavedForm, type SaveState } from '@/components/saved-form'
import { Select } from '@/components/ui/select'
import { btn } from '@/components/ui/button'
import { ABSENCE_TYPES } from '@/lib/absences'

const inputClass =
  'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring'

/** Client wrapper so the error text can be translated (functions can't cross the RSC line). */
export function AbsenceForm({ action }: { action: (formData: FormData) => Promise<SaveState> }) {
  const t = useTranslations('absences')
  const tc = useTranslations('common')

  return (
    <SavedForm
      action={action}
      resetOnSave
      className="mt-4 space-y-3 border-t border-border pt-4"
      errorLabel={(code) => (code === 'invalidRange' ? t('invalidRange') : tc('saveFailed'))}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          {t('type')}
          <Select name="type" className="mt-1 w-full" defaultValue="VACATION">
            {ABSENCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`type${type}` as 'typeVACATION')}
              </option>
            ))}
          </Select>
        </label>
        <label className="block text-sm">
          {t('from')}
          <input type="date" name="startDate" required className={inputClass} />
        </label>
        <label className="block text-sm">
          {t('to')}
          <input type="date" name="endDate" className={inputClass} />
        </label>
      </div>
      <div className="flex items-end gap-3">
        <label className="block flex-1 text-sm">
          {t('note')}
          <input name="note" placeholder={t('noteHint')} className={inputClass} />
        </label>
        <button type="submit" className={btn.primarySm}>
          {t('add')}
        </button>
      </div>
    </SavedForm>
  )
}
