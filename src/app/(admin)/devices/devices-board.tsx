import Link from 'next/link'
import type { HolderColumn } from '@/lib/wattro/details'
import { WhereIcon } from './wattro-where'

/**
 * The devices as a board, drawn like the projects board: one grey list per
 * place — the store, every person, every site — and a white card per
 * machine. Read-only: a machine moves when the crew scans it in Wattro, not
 * by dragging it here.
 */

export type BoardCard = {
  id: string
  name: string
  /** Inventory number · brand and model, already joined. */
  meta: string
  /** "seit 23.09.2026" with a person or on a site; nothing in the store. */
  since: string | null
  inactive: boolean
}

export function DevicesBoard({
  columns,
  labels,
}: {
  columns: HolderColumn<BoardCard>[]
  labels: {
    kind: Record<'store' | 'employee' | 'project', string>
    finished: string
    finishedHint: string
    inactive: string
    empty: string
  }
}) {
  if (columns.length === 0) {
    return <p className="rounded-xl border border-border bg-surface px-4 py-8 text-center text-sm text-muted">{labels.empty}</p>
  }

  return (
    // The lists stand side by side and the row scrolls sideways; each list
    // scrolls on its own, so the store's few hundred machines do not push
    // the people and sites out of reach.
    <div className="-mx-4 flex items-start gap-3 overflow-x-auto px-4 pb-2 md:-ml-6 md:-mr-8 md:pl-6 md:pr-8">
      {columns.map((column) => (
        <section
          key={column.key}
          aria-label={column.label}
          className="flex max-h-[calc(100dvh-13rem)] w-[272px] shrink-0 flex-col overflow-hidden rounded-xl bg-subtle"
        >
          <header className="shrink-0 px-3 pb-1.5 pt-2.5">
            <div className="flex items-center gap-1.5">
              <WhereIcon kind={column.kind} label={labels.kind[column.kind]} />
              <h3 className="min-w-0 flex-1 truncate text-sm font-semibold" title={column.label}>
                {column.label}
              </h3>
              <span className="shrink-0 text-xs tabular-nums text-muted">{column.items.length}</span>
            </div>
            {column.sub && (
              <p className="truncate pl-[22px] text-xs text-muted" title={column.sub}>
                {column.sub}
              </p>
            )}
            {column.finished && (
              <p className="pl-[22px] text-xs text-amber-700 dark:text-amber-400" title={labels.finishedHint}>
                {labels.finished}
              </p>
            )}
          </header>

          <ul className="min-h-0 space-y-1.5 overflow-y-auto px-2 pb-2">
            {column.items.map((card) => (
              <li key={card.id}>
                <Link
                  href={`/devices/${card.id}`}
                  className="block rounded-lg border border-border bg-surface px-3 py-2 transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <span className="min-w-0 truncate">{card.name}</span>
                    {card.inactive && (
                      <span className="shrink-0 rounded-full bg-subtle px-1.5 py-px text-[10px] font-normal text-muted">
                        {labels.inactive}
                      </span>
                    )}
                  </p>
                  {card.meta && <p className="truncate text-xs tabular-nums text-muted">{card.meta}</p>}
                  {card.since && <p className="mt-0.5 text-xs text-muted">{card.since}</p>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
