'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ComboboxOption } from '@/components/combobox'
import { EntryDialog, type DialogState } from '../../schedule/entry-dialog'
import { createScheduleEntry } from '../../schedule/actions'
import { iso, todayUtc } from '@/lib/dates'

/** "Einsatz planen" on the project page — opens the schedule dialog with this project preselected. */
export function PlanEntryButton({
  projectId,
  projects,
  employees,
  vehicles,
}: {
  projectId: string
  projects: ComboboxOption[]
  employees: ComboboxOption[]
  vehicles: ComboboxOption[]
}) {
  const t = useTranslations('schedule')
  const tc = useTranslations('common')
  const router = useRouter()
  const [dialog, setDialog] = useState<DialogState>({ mode: 'closed' })
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <>
      <button
        type="button"
        onClick={() => setDialog({ mode: 'create', date: iso(todayUtc()), projectId })}
        className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent-hover"
      >
        + {t('planEntry')}
      </button>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      {dialog.mode !== 'closed' && (
        <EntryDialog
          dialog={dialog}
          projects={projects}
          employees={employees}
          vehicles={vehicles}
          pending={pending}
          onClose={() => setDialog({ mode: 'closed' })}
          onSubmit={(input) => {
            setError(null)
            startTransition(async () => {
              const result = await createScheduleEntry(input)
              if (result.error) {
                setError(result.error === 'duplicateEntry' ? t('duplicateEntry') : tc('saveFailed'))
              } else {
                setDialog({ mode: 'closed' })
                router.refresh()
              }
            })
          }}
        />
      )}
    </>
  )
}
