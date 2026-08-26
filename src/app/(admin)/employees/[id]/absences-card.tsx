import { getLocale, getTranslations } from 'next-intl/server'
import { DeleteButton } from '@/components/delete-button'
import { createAbsence, deleteAbsence } from '../actions'
import { AbsenceForm } from './absence-form'

export type AbsenceRow = {
  id: string
  type: string
  startDate: Date
  endDate: Date
  note: string | null
}

/** Holiday/sick list on the employee page; the planner warns from this data. */
export async function AbsencesCard({
  employeeId,
  absences,
}: {
  employeeId: string
  absences: AbsenceRow[]
}) {
  const [t, tc, locale] = await Promise.all([
    getTranslations('absences'),
    getTranslations('common'),
    getLocale(),
  ])
  const fmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const todayIso = new Date().toISOString().slice(0, 10)

  return (
    <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-semibold">{t('title')}</h2>

      {absences.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t('none')}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border text-sm">
          {absences.map((a) => {
            const current =
              a.startDate.toISOString().slice(0, 10) <= todayIso &&
              todayIso <= a.endDate.toISOString().slice(0, 10)
            return (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    {t(`type${a.type}` as 'typeVACATION')}
                    {current && (
                      <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                        {t('currently')}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    {fmt.format(a.startDate)} – {fmt.format(a.endDate)}
                    {a.note && ` · ${a.note}`}
                  </p>
                </div>
                <DeleteButton
                  action={deleteAbsence.bind(null, a.id)}
                  label={tc('delete')}
                  confirmMessage={`${t(`type${a.type}` as 'typeVACATION')} ${fmt.format(a.startDate)} – ${fmt.format(a.endDate)} — ${tc('delete')}?`}
                />
              </li>
            )
          })}
        </ul>
      )}

      <AbsenceForm action={createAbsence.bind(null, employeeId)} />
    </section>
  )
}
