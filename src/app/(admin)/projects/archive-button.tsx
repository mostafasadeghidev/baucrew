'use client'

/**
 * A card put away, or taken out of the archive again — one button, its word
 * depending on where the card is. From the sheet over the board, archiving
 * closes the sheet as well: the card has left the board it was opened from.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Archive, ArchiveRestore } from 'lucide-react'
import { btn } from '@/components/ui/button'
import { archiveProject } from './actions'

export function ArchiveButton({
  projectId,
  archived,
  label,
  closeTo,
}: {
  projectId: string
  archived: boolean
  label: string
  /** Where to go once the card is archived — the board it was opened over. */
  closeTo?: string | null
}) {
  const tc = useTranslations('common')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [failed, setFailed] = useState(false)
  const Icon = archived ? ArchiveRestore : Archive
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setFailed(false)
          startTransition(async () => {
            const result = await archiveProject(projectId, !archived)
            if (result?.error) {
              setFailed(true)
              return
            }
            if (!archived && closeTo) {
              // The board's address as it was, without the card that has just left it.
              const url = new URL(closeTo, window.location.origin)
              url.searchParams.delete('card')
              router.replace(`${url.pathname}${url.search}`, { scroll: false })
            } else router.refresh()
          })
        }}
        className={`${btn.outlineSm} gap-1.5`}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </button>
      {failed && <span className="mt-1 text-xs text-danger">{tc('saveFailed')}</span>}
    </span>
  )
}
