'use client'

/**
 * What can be added to a card, in a row under its title — where Trello keeps
 * it now that the right of the card belongs to the comments. Each button leads
 * to where that is done on the project — it opens the card that holds the
 * field, or goes to the list — rather than doing it in a second place.
 */

import { CalendarDays, ListChecks, MessageSquare, Paperclip, Tag, Users } from 'lucide-react'
import { PROJECT_EDIT_CARD_EVENT, type ProjectSectionKey } from './project-form'

export function SheetAddBar({
  labels,
}: {
  labels: { heading: string; members: string; labels: string; checklist: string; dates: string; attachment: string; comment: string }
}) {
  const edit = (key: ProjectSectionKey) => window.dispatchEvent(new CustomEvent(PROJECT_EDIT_CARD_EVENT, { detail: key }))
  const jump = (id: string, focus = false) => {
    const target = document.getElementById(id)
    // The comments stand beside the cards and are in view already; what they
    // need is the caret, not a scroll that moves the whole sheet for nothing.
    target?.scrollIntoView({ behavior: 'smooth', block: focus ? 'nearest' : 'start' })
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
    <div className="flex flex-wrap items-center gap-1.5 px-1">
      <p className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{labels.heading}</p>
      {items.map(({ icon: Icon, label, run }) => (
        <button
          key={label}
          type="button"
          onClick={run}
          className="flex items-center gap-1.5 rounded-md bg-subtle px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-surface-hover"
        >
          <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  )
}
