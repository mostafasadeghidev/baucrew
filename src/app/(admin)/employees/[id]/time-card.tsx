import { getLocale, getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { DeleteButton } from '@/components/delete-button'
import { entryMinutes, formatMinutes, sumMinutes } from '@/lib/time-entries'
import { addTimeEntry, deleteTimeEntry } from '../actions'
import { TimeForm } from './time-form'

export type TimeRow = {
  id: string
  startedAt: Date
  endedAt: Date | null
  source: string
  note: string | null
  project: { id: string; number: string; name: string } | null
}

/** The last two weeks of recorded time, with corrections from the office. */
export async function TimeCard({
  employeeId,
  entries,
  projects,
}: {
  employeeId: string
  entries: TimeRow[]
  projects: Array<{ value: string; label: string }>
}) {
  const [t, tc, locale] = await Promise.all([
    getTranslations('time'),
    getTranslations('common'),
    getLocale(),
  ])
  const intl = locale === 'en' ? 'en-GB' : 'de-DE'
  const dayFmt = new Intl.DateTimeFormat(intl, { weekday: 'short', day: '2-digit', month: '2-digit' })
  const timeFmt = new Intl.DateTimeFormat(intl, { hour: '2-digit', minute: '2-digit' })
  const now = new Date()
  const total = sumMinutes(entries, now)

  return (
    <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('title')}</h2>
        {entries.length > 0 && (
          <span className="text-sm tabular-nums text-muted">
            {t('total14', { hours: formatMinutes(total) })}
          </span>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t('none')}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border text-sm">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="w-24 shrink-0 text-muted">{dayFmt.format(entry.startedAt)}</span>
              <span className="shrink-0 tabular-nums">
                {timeFmt.format(entry.startedAt)}–{entry.endedAt ? timeFmt.format(entry.endedAt) : '…'}
              </span>
              <span className="shrink-0 font-medium tabular-nums">
                {entry.endedAt ? formatMinutes(entryMinutes(entry, now)) : t('running')}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted">
                {entry.project ? (
                  <Link href={`/projects/${entry.project.id}`} className="text-accent hover:underline">
                    {entry.project.number} — {entry.project.name}
                  </Link>
                ) : (
                  '—'
                )}
                {entry.note && ` · ${entry.note}`}
              </span>
              {entry.source !== 'worker' && (
                <span className="shrink-0 rounded-full bg-subtle px-2 py-0.5 text-[11px] text-muted">
                  {t(`source_${entry.source}` as 'source_office')}
                </span>
              )}
              <DeleteButton
                action={deleteTimeEntry.bind(null, entry.id)}
                label={tc('delete')}
                confirmMessage={`${dayFmt.format(entry.startedAt)} — ${tc('delete')}?`}
              />
            </li>
          ))}
        </ul>
      )}

      <TimeForm action={addTimeEntry.bind(null, employeeId)} projects={projects} />
    </section>
  )
}
