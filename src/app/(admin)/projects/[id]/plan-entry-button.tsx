'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ComboboxOption } from '@/components/combobox'
import { EntryDialog, type DialogState } from '../../schedule/entry-dialog'
import { createScheduleEntry } from '../../schedule/actions'
import { iso, todayUtc } from '@/lib/dates'
import { btn } from '@/components/ui/button'

type AbsenceHint = { employeeId: string; start: string; end: string; label: string }

/**
 * "Einsatz planen" — opens the schedule dialog from somewhere that is not the
 * schedule. On the project page it comes with the project chosen and today's
 * date; on the overview with the day the card stands for — tomorrow, say — and,
 * beside a project listed there, with that project too.
 */
export function PlanEntryButton({
  projectId,
  date,
  projects,
  employees,
  vehicles,
  absences,
  label,
  quiet = false,
}: {
  /** The project the dialog opens on; none, and it is picked in the dialog. */
  projectId?: string
  /** The day the dialog opens on (yyyy-mm-dd); today when left out. */
  date?: string
  projects: ComboboxOption[]
  employees: ComboboxOption[]
  vehicles: ComboboxOption[]
  /** Who is away when — the dialog warns beside their name. */
  absences?: AbsenceHint[]
  /** The button's own words; "Einsatz planen" when left out. */
  label?: string
  /** An outlined button, for a row of a list rather than the head of a card. */
  quiet?: boolean
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
        onClick={() => setDialog({ mode: 'create', date: date ?? iso(todayUtc()), projectId })}
        className={`${quiet ? btn.outlineSm : btn.primarySm} shrink-0 text-xs`}
      >
        + {label ?? t('planEntry')}
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
          absences={absences}
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
