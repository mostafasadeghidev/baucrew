'use client'

/**
 * Trello's "Beobachten" under a card's title: the eye, and a tick once the
 * user follows the card. What happens on it then reaches their bell.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check, Eye } from 'lucide-react'
import { setCardWatch } from '../actions'

export function WatchButton({ projectId, watching }: { projectId: string; watching: boolean }) {
  const t = useTranslations('projects')
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [on, setOn] = useState(watching)
  const [seen, setSeen] = useState(watching)
  if (seen !== watching) {
    setSeen(watching)
    setOn(watching)
  }

  const toggle = () => {
    const next = !on
    setOn(next)
    startTransition(async () => {
      const result = await setCardWatch(projectId, next)
      if (result.error) setOn(!next)
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      title={on ? t('watchingHint') : t('watchHint')}
      className="mt-1 inline-flex h-7 items-center gap-1.5 rounded-md bg-subtle px-2.5 text-sm font-medium transition-colors hover:bg-surface-hover"
    >
      <Eye className="h-4 w-4 shrink-0" aria-hidden />
      {on ? t('watching') : t('watch')}
      {on && (
        <span className="flex h-4 w-4 items-center justify-center rounded bg-foreground/80 text-background">
          <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
        </span>
      )}
    </button>
  )
}
