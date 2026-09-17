'use client'

/**
 * The right-hand column of a card's sheet, the way Trello has it: what can be
 * added to the card. Each button leads to where that is done on the project —
 * it opens the card that holds the field, or goes down to the list — rather
 * than doing it in a second place.
 */

import { CalendarDays, ListChecks, MessageSquare, Paperclip, Tag, Users } from 'lucide-react'
import { PROJECT_EDIT_CARD_EVENT, type ProjectSectionKey } from './project-form'

export function SheetSidebar({
  labels,
}: {
  labels: { heading: string; members: string; labels: string; checklist: string; dates: string; attachment: string; comment: string }
}) {
  const edit = (key: ProjectSectionKey) => window.dispatchEvent(new CustomEvent(PROJECT_EDIT_CARD_EVENT, { detail: key }))
  const jump = (id: string, focus = false) => {
    const target = document.getElementById(id)
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    if (focus) setTimeout(() => target?.querySelector<HTMLElement>('textarea')?.focus({ preventScroll: true }), 350)
  }

  const items = [
    { icon: Users, label: labels.members, run: () => edit('assignment') },
    { icon: Tag, label: labels.labels, run: () => edit('basic') },
    { icon: ListChecks, label: labels.checklist, run: () => jump('checklists') },
    { icon: CalendarDays, label: labels.dates, run: () => edit('planning') },
    { icon: Paperclip, label: labels.attachment, run: () => jump('files') },
    { icon: MessageSquare, label: labels.comment, run: () => jump('comments', true) },
  ]

  return (
    <aside className="order-first lg:sticky lg:top-24 lg:order-none">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{labels.heading}</p>
      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-1">
        {items.map(({ icon: Icon, label, run }) => (
          <button
            key={label}
            type="button"
            onClick={run}
            className="flex items-center gap-2 rounded-md bg-subtle px-3 py-1.5 text-left text-sm font-medium transition-colors hover:bg-surface-hover"
          >
            <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>
    </aside>
  )
}
