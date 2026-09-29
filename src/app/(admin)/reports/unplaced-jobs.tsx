'use client'

/**
 * The jobs of the year that have no month yet, as a column beside the months
 * of the Planumsatz: searched as it is typed into, each line picked up and
 * dropped into a month (see month-drag.tsx), which places the job there. A job
 * placed leaves the column the moment the page is read again.
 */

import { useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { DragLine } from './month-drag'

export type UnplacedJob = {
  id: string
  number: string
  name: string
  customer: string
  /** The order value, as the month cards write it; a longer one for the tooltip. */
  amount: string
  exact?: string
}

export function UnplacedJobs({
  jobs,
  total,
  labels,
}: {
  jobs: UnplacedJob[]
  /** The sum of their order values, written out. */
  total: string
  labels: { title: string; hint: string; search: string; noMatch: string; drag: string }
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const shown = q ? jobs.filter((j) => `${j.number} ${j.name} ${j.customer}`.toLowerCase().includes(q)) : jobs

  return (
    <aside className="rounded-xl border border-dashed border-accent/50 bg-surface p-3 shadow-sm print:hidden lg:sticky lg:top-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {labels.title}
          <span className="ml-1.5 text-xs font-normal tabular-nums text-muted">{jobs.length}</span>
        </h3>
        <span className="text-xs font-semibold tabular-nums">{total}</span>
      </div>
      <p className="mt-0.5 text-[11px] text-muted">{labels.hint}</p>
      <label className="relative mt-2 block">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={labels.search}
          aria-label={labels.search}
          className="block w-full rounded-md border border-border bg-background py-1.5 pl-7 pr-2 text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </label>
      {shown.length === 0 ? (
        <p className="py-3 text-center text-xs text-muted">{labels.noMatch}</p>
      ) : (
        <ul className="-mx-1 mt-2 max-h-[min(70vh,40rem)] space-y-0.5 overflow-y-auto px-1">
          {shown.map((job) => (
            <li key={job.id}>
              {/* No month to stand in: a drop on any month of the year places it. */}
              <DragLine projectId={job.id} month={-1} enabled title={labels.drag}>
                <div className="rounded-md border border-border bg-background px-2 py-1.5 text-xs hover:border-accent/60">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link href={`/projects/${job.id}`} title={job.name} className="min-w-0 truncate font-medium text-accent hover:underline">
                      {job.name}
                    </Link>
                    <span className="shrink-0 tabular-nums text-muted" title={job.exact}>
                      {job.amount}
                    </span>
                  </div>
                  <p className="truncate text-[11px] text-muted" title={job.customer}>
                    <span className="tabular-nums">{job.number}</span> · {job.customer}
                  </p>
                </div>
              </DragLine>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
