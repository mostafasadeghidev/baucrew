'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Combobox, type ComboboxOption } from '@/components/combobox'
import { btn } from '@/components/ui/button'
import { handOutDevice, returnDevice } from './actions'

/**
 * Hand a device to a site or to a person — and take it back. Whichever of the
 * two pickers is filled last wins, so nobody has to think about the order.
 */
export function HandoutPanel({
  deviceId,
  busy,
  projects,
  employees,
}: {
  deviceId: string
  /** True while the device is still out; then only "take back" is offered. */
  busy: boolean
  projects: ComboboxOption[]
  employees: ComboboxOption[]
}) {
  const t = useTranslations('devices')
  const tc = useTranslations('common')
  const [projectId, setProjectId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function give() {
    setError(null)
    if (!projectId && !employeeId) {
      setError('saveFailed')
      return
    }
    startTransition(async () => {
      const res = await handOutDevice(deviceId, { projectId, employeeId, note })
      if (res.error) setError(res.error)
      else {
        setProjectId('')
        setEmployeeId('')
        setNote('')
      }
    })
  }

  function take() {
    setError(null)
    startTransition(async () => {
      const res = await returnDevice(deviceId)
      if (res.error) setError(res.error)
    })
  }

  if (busy) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={take}
          disabled={pending}
          className={`${btn.primary} w-full justify-center disabled:opacity-60`}
        >
          {t('takeBack')}
        </button>
        {error && <p className="text-sm text-red-700 dark:text-red-400">{t('handoutFailed')}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium">{t('toProject')}</label>
        <Combobox
          name="handoutProject"
          options={projects}
          defaultValue={projectId}
          onSelect={(id) => {
            setProjectId(id)
            if (id) setEmployeeId('')
          }}
          placeholder={tc('none')}
          noResultsLabel={t('noResults')}
          clearable
          clearLabel={tc('clear')}
        />
      </div>
      <div>
        <label className="block text-sm font-medium">{t('toEmployee')}</label>
        <Combobox
          name="handoutEmployee"
          options={employees}
          defaultValue={employeeId}
          onSelect={(id) => {
            setEmployeeId(id)
            if (id) setProjectId('')
          }}
          placeholder={tc('none')}
          noResultsLabel={t('noResults')}
          clearable
          clearLabel={tc('clear')}
        />
      </div>
      <label className="block text-sm">
        {t('note')}
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </label>
      {error && (
        <p className="text-sm text-red-700 dark:text-red-400">
          {error === 'busy' ? t('alreadyOut') : t('pickTarget')}
        </p>
      )}
      <button
        type="button"
        onClick={give}
        disabled={pending}
        className={`${btn.primary} w-full justify-center disabled:opacity-60`}
      >
        {t('handOut')}
      </button>
    </div>
  )
}
