'use client'

/**
 * The right-hand end of a project's bar.
 *
 * Normally it is what the page can do to the project — reopen it, print its
 * work order, delete it — with "Bearbeiten" at the end. Press that and the
 * group is replaced by save and cancel: a row of buttons that stay live next
 * to an unsaved form is a row of ways to lose the work. They are replaced
 * rather than hidden — the bar keeps its shape, so nothing on the page moves.
 *
 * Folding a duplicate into the project is part of putting a project right,
 * not of reading it, so that button stands with save and cancel
 * (`whileEditing`) rather than among the everyday ones.
 *
 * A single card opened with its pencil carries its own two buttons; this stays
 * "Bearbeiten" then, because that is still what it does: open the rest.
 *
 * It talks to the form through DOM events rather than props, because the bar
 * and the cards are siblings: lifting the state high enough to pass it down
 * would mean making the whole page a client component for the sake of one
 * button. Saving works from out here because the form has an id.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { Pencil } from 'lucide-react'
import { btn } from '@/components/ui/button'
import {
  PROJECT_EDIT_ALL_EVENT,
  PROJECT_EDIT_CANCEL_EVENT,
  PROJECT_EDIT_STATE_EVENT,
  PROJECT_FORM_ID,
  type ProjectEditMode,
} from '../project-form'

export function ProjectBarActions({
  label,
  saveLabel,
  cancelLabel,
  whileEditing,
  children,
}: {
  label: string
  saveLabel: string
  cancelLabel: string
  /** What is offered only while the whole project is open for editing — merging a duplicate into it. */
  whileEditing?: ReactNode
  /** Everything the bar offers while nothing is being edited. */
  children: ReactNode
}) {
  const [mode, setMode] = useState<ProjectEditMode>('none')

  useEffect(() => {
    const onState = (event: Event) => setMode((event as CustomEvent<ProjectEditMode>).detail)
    window.addEventListener(PROJECT_EDIT_STATE_EVENT, onState)
    return () => window.removeEventListener(PROJECT_EDIT_STATE_EVENT, onState)
  }, [])

  if (mode === 'all') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {whileEditing}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent(PROJECT_EDIT_CANCEL_EVENT))}
          className={btn.outlineSm}
        >
          {cancelLabel}
        </button>
        <button type="submit" form={PROJECT_FORM_ID} className={btn.primarySm}>
          {saveLabel}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {children}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent(PROJECT_EDIT_ALL_EVENT))}
        className={`${btn.outlineSm} gap-1.5`}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden />
        {label}
      </button>
    </div>
  )
}
