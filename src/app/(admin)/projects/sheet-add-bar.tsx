'use client'

/**
 * The buttons under a card's title, the way Trello has them: "+ Hinzufügen"
 * with everything that can be added to the card, and beside it the ones used
 * most — labels, dates, checklist, members. Each leads to where that is done
 * on the project — it opens the card of the form that holds the field, or goes
 * to the list — rather than doing it in a second place.
 */

import { CalendarDays, CheckSquare, Clock, MessageSquare, Paperclip, Plus, Tag, UserPlus, Users } from 'lucide-react'
import { Menu, menuItemClass } from '@/components/ui/menu'
import { PROJECT_EDIT_CARD_EVENT, type ProjectSectionKey } from './project-form'

/** The bordered button of Trello's card back. */
export const CARD_BUTTON =
  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-surface-hover hover:text-foreground'

const edit = (key: ProjectSectionKey) => window.dispatchEvent(new CustomEvent(PROJECT_EDIT_CARD_EVENT, { detail: key }))
const jump = (id: string, focus = false) => {
  const target = document.getElementById(id)
  // The comments stand beside the cards and are in view already; what they
  // need is the caret, not a scroll that moves the whole sheet for nothing.
  target?.scrollIntoView({ behavior: 'smooth', block: focus ? 'nearest' : 'start' })
  if (focus) setTimeout(() => target?.querySelector<HTMLElement>('textarea')?.focus({ preventScroll: true }), 350)
}

/** "+ Hinzufügen" alone — also what the compact title bar carries once the title has scrolled away. */
export function SheetAddMenu({
  labels,
}: {
  labels: { add: string; members: string; labels: string; checklist: string; dates: string; attachment: string; comment: string }
}) {
  const items = [
    { icon: Users, label: labels.members, run: () => edit('assignment') },
    { icon: Tag, label: labels.labels, run: () => edit('basic') },
    { icon: CalendarDays, label: labels.dates, run: () => edit('planning') },
    { icon: CheckSquare, label: labels.checklist, run: () => jump('checklists') },
    { icon: Paperclip, label: labels.attachment, run: () => jump('files') },
    { icon: MessageSquare, label: labels.comment, run: () => jump('comments', true) },
  ]
  return (
    <Menu
      side="bottom"
      align="start"
      label={labels.add}
      className={CARD_BUTTON}
      trigger={
        <>
          <Plus className="h-4 w-4 shrink-0" aria-hidden />
          {labels.add}
        </>
      }
    >
      {items.map(({ icon: Icon, label, run }) => (
        <button key={label} type="button" role="menuitem" className={menuItemClass} onClick={run}>
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
          {label}
        </button>
      ))}
    </Menu>
  )
}

export function SheetAddBar({
  labels,
}: {
  labels: { add: string; members: string; labels: string; checklist: string; dates: string; attachment: string; comment: string }
}) {
  const quick = [
    { icon: Tag, label: labels.labels, run: () => edit('basic') },
    { icon: Clock, label: labels.dates, run: () => edit('planning') },
    { icon: CheckSquare, label: labels.checklist, run: () => jump('checklists') },
    { icon: UserPlus, label: labels.members, run: () => edit('assignment') },
  ]
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SheetAddMenu labels={labels} />
      {quick.map(({ icon: Icon, label, run }) => (
        <button key={label} type="button" onClick={run} className={CARD_BUTTON}>
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  )
}
