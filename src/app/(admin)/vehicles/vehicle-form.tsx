'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { VehicleFormState } from './actions'
import { Select } from '@/components/ui/select'

export type VehicleFormValues = {
  name: string
  licensePlate: string
  type: string
  status: string
  active: boolean
  notes: string
}

const STATUSES = ['AVAILABLE', 'MAINTENANCE', 'OUT_OF_SERVICE'] as const

const inputClass =
  'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent'

export function VehicleForm({
  action,
  initial,
  cancelHref,
}: {
  action: (prev: VehicleFormState, formData: FormData) => Promise<VehicleFormState>
  initial: VehicleFormValues
  cancelHref: string
}) {
  const t = useTranslations('vehicles')
  const tc = useTranslations('common')
  const tStatus = useTranslations('vehicleStatus')
  const [state, formAction, pending] = useActionState<VehicleFormState, FormData>(action, {})

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
            <label htmlFor="licensePlate" className="block text-sm font-medium">
              {t('licensePlate')}
            </label>
            <input
              id="licensePlate"
              name="licensePlate"
              defaultValue={initial.licensePlate}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="type" className="block text-sm font-medium">
              {t('type')}
            </label>
            <input id="type" name="type" defaultValue={initial.type} className={inputClass} />
          </div>
          <div>
            <label htmlFor="status" className="block text-sm font-medium">
              {t('status')}
            </label>
            <Select id="status" name="status" defaultValue={initial.status} className="mt-1 w-full">
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {tStatus(s)}
                </option>
              ))}
            </Select>
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

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
        >
          {tc('save')}
        </button>
        <Link
          href={cancelHref}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface-hover"
        >
          {tc('cancel')}
        </Link>
      </div>
    </form>
  )
}
