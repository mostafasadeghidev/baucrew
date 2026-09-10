'use client'

/**
 * "Bearbeiten" in the project's own bar. It opens every card on the page at
 * once, and then becomes the save and cancel for them — in the same place,
 * so the bar keeps its width and nothing under it moves.
 *
 * A card opened on its own with its pencil carries its own two buttons; this
 * one stays "Bearbeiten" then, because that is still what it does: open the
 * rest of them.
 *
 * It talks to the form through DOM events rather than props, because the bar
 * and the cards are siblings: lifting the state high enough to pass it down
 * would mean making the whole page a client component for the sake of one
 * button. Saving works from out here because the form has an id.
 */

import { useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import { btn } from '@/components/ui/button'
import {
  PROJECT_EDIT_ALL_EVENT,
  PROJECT_EDIT_CANCEL_EVENT,
  PROJECT_EDIT_STATE_EVENT,
  PROJECT_FORM_ID,
  type ProjectEditMode,
} from '../project-form'

export function EditAllButton({
  label,
  saveLabel,
  cancelLabel,
}: {
  label: string
  saveLabel: string
  cancelLabel: string
}) {
  const [mode, setMode] = useState<ProjectEditMode>('none')

  useEffect(() => {
    const onState = (event: Event) => setMode((event as CustomEvent<ProjectEditMode>).detail)
    window.addEventListener(PROJECT_EDIT_STATE_EVENT, onState)
    return () => window.removeEventListener(PROJECT_EDIT_STATE_EVENT, onState)
  }, [])

  if (mode === 'all') {
    return (
      <span className="flex items-center gap-2">
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
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(PROJECT_EDIT_ALL_EVENT))}
      className={`${btn.outlineSm} gap-1.5`}
    >
      <Pencil className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  )
}
