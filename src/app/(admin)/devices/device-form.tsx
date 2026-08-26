'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { SavedForm, type SaveState } from '@/components/saved-form'
import { DeleteButton } from '@/components/delete-button'
import { btn } from '@/components/ui/button'

const inputClass =
  'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring'

const FORM_ID = 'device-form'

export type DeviceValues = {
  name: string
  inventoryNo: string
  category: string
  storageLocation: string
  videoUrl: string
  notes: string
  active: boolean
}

export function DeviceForm({
  action,
  initial,
  deleteAction,
  categories,
}: {
  action: (formData: FormData) => Promise<SaveState>
  initial: DeviceValues
  deleteAction?: (prev: { error?: string }, formData: FormData) => Promise<{ error?: string }>
  /** Categories already in use — offered as suggestions. */
  categories: string[]
}) {
  const t = useTranslations('devices')
  const tc = useTranslations('common')

  return (
    <div className="space-y-4">
      <SavedForm
        id={FORM_ID}
        action={action}
        className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-sm"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            {t('name')}
            <input name="name" defaultValue={initial.name} required autoFocus className={inputClass} />
          </label>
          <label className="block text-sm">
            {t('inventoryNo')}
            <input name="inventoryNo" defaultValue={initial.inventoryNo} className={inputClass} />
          </label>
          <label className="block text-sm">
            {t('category')}
            <input
              name="category"
              defaultValue={initial.category}
              list="device-categories"
              className={inputClass}
            />
            <datalist id="device-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="block text-sm">
            {t('storageLocation')}
            <input
              name="storageLocation"
              defaultValue={initial.storageLocation}
              placeholder={t('storageHint')}
              className={inputClass}
            />
          </label>
        </div>

        <label className="block text-sm">
          {t('videoUrl')}
          <input
            name="videoUrl"
            type="url"
            defaultValue={initial.videoUrl}
            placeholder="https://…"
            className={inputClass}
          />
          <span className="mt-1 block text-xs text-muted">{t('videoHint')}</span>
        </label>

        <label className="block text-sm">
          {t('notes')}
          <textarea name="notes" rows={3} defaultValue={initial.notes} className={inputClass} />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={initial.active}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          {tc('active')}
        </label>
      </SavedForm>

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" form={FORM_ID} className={btn.primary}>
          {tc('save')}
        </button>
        <Link href="/devices" className={btn.outline}>
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
