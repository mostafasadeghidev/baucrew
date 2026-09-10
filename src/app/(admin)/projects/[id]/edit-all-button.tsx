'use client'

/**
 * "Bearbeiten" in the project's own bar. It opens every card on the page at
 * once; each card can also be opened on its own with the pencil beside its
 * title.
 *
 * It talks to the form through a DOM event rather than through props, because
 * the bar and the cards are siblings: lifting the state high enough to pass it
 * down would mean making the whole page a client component for the sake of one
 * button.
 */

import { Pencil } from 'lucide-react'
import { btn } from '@/components/ui/button'
import { PROJECT_EDIT_ALL_EVENT } from '../project-form'

export function EditAllButton({ label }: { label: string }) {
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
