'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Combobox, type ComboboxOption } from '@/components/combobox'
import { btn } from '@/components/ui/button'
import {
  addProjectDevice,
  handOutDevice,
  removeProjectDevice,
  returnDevice,
} from '../../devices/actions'

export type ProjectDeviceRow = {
  id: string
  name: string
  inventoryNo: string | null
  /** free = in the store, here = on this site, busy = somewhere else */
  state: 'free' | 'here' | 'busy'
  where: string
}

/**
 * The machines this site needs — same shape as the tools/materials list:
 * add with a picker, remove with ✕. The green/red dot says where each one is,
 * and the button next to it hands it out or takes it back without leaving the
 * page.
 */
export function ProjectDevicesEditor({
  projectId,
  devices,
  options,
  onChanged,
  pending: externalPending = false,
}: {
  projectId: string
  devices: ProjectDeviceRow[]
  options: ComboboxOption[]
  onChanged?: () => void
  pending?: boolean
}) {
  const t = useTranslations('devices')
  const tc = useTranslations('common')
  const [ownPending, startTransition] = useTransition()
  const pending = ownPending || externalPending
  const [error, setError] = useState<string | null>(null)
  const [addKey, setAddKey] = useState(0)

  function add(deviceId: string) {
    if (!deviceId) return
    setError(null)
    startTransition(async () => {
      const res = await addProjectDevice(projectId, deviceId)
      if (res.error) setError(res.error === 'alreadyAdded' ? t('alreadyAdded') : tc('saveFailed'))
      else {
        setAddKey((k) => k + 1)
        onChanged?.()
      }
    })
  }

  return (
    <div>
      {devices.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">{t('noneNeeded')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {devices.map((device) => (
            <li
              key={device.id}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 py-2.5 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden
                  className={
                    device.state === 'busy'
                      ? 'text-red-700 dark:text-red-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                  }
                >
                  ●
                </span>
                <span className="truncate">{device.name}</span>
                {device.inventoryNo && (
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    {device.inventoryNo}
                  </span>
                )}
                <span
                  className={`shrink-0 text-xs ${
                    device.state === 'busy'
                      ? 'text-red-700 dark:text-red-400'
                      : device.state === 'here'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-muted'
                  }`}
                >
                  {device.state === 'here'
                    ? t('needHere')
                    : device.state === 'free'
                      ? t('free')
                      : device.where || t('out')}
                </span>
              </span>

              <span className="flex shrink-0 items-center gap-2">
                {device.state === 'free' && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await handOutDevice(device.id, { projectId })
                        onChanged?.()
                      })
                    }
                    className={`${btn.outlineSm} px-2 py-1 text-xs`}
                  >
                    {t('handOutNow')}
                  </button>
                )}
                {device.state === 'here' && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await returnDevice(device.id)
                        onChanged?.()
                      })
                    }
                    className={`${btn.outlineSm} px-2 py-1 text-xs`}
                  >
                    {t('takeBack')}
                  </button>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await removeProjectDevice(projectId, device.id)
                      onChanged?.()
                    })
                  }
                  title={t('removeNeed')}
                  aria-label={t('removeNeed')}
                  className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:bg-danger/10 hover:text-danger"
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-start gap-2 border-t border-border px-5 py-3">
        <div className="min-w-52 flex-1" key={addKey}>
          <Combobox
            name="deviceId"
            options={options}
            placeholder={t('selectDevice')}
            noResultsLabel={t('noResults')}
            onSelect={(id) => add(id)}
          />
        </div>
        {error && (
          <p role="alert" className="w-full text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
