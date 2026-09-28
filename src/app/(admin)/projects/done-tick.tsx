'use client'

/**
 * Trello's tick on a card: an empty circle before the title that fills green
 * when the card is marked done. The office's own mark, apart from the
 * project's status — a job can be done on the site and still wait for its
 * invoice. On the board it shows while the pointer is over the card, and for
 * good once the card is done.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check } from 'lucide-react'
import { setCardDone } from './actions'

export function DoneTick({
  projectId,
  done,
  large = false,
  className = '',
}: {
  projectId: string
  done: boolean
  /** The card's back: the circle beside the big title. */
  large?: boolean
  className?: string
}) {
  const t = useTranslations('projects')
  const router = useRouter()
  const [, startTransition] = useTransition()
  // Ticked at once; the server's word follows with the next drawing.
  const [on, setOn] = useState(done)
  const [seen, setSeen] = useState(done)
  if (seen !== done) {
    setSeen(done)
    setOn(done)
  }

  const toggle = () => {
    const next = !on
    setOn(next)
    startTransition(async () => {
      const result = await setCardDone(projectId, next)
      if (result.error) setOn(!next)
      router.refresh()
    })
  }

  const box = large ? 'h-6 w-6' : 'h-4 w-4'
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={on ? t('cardDoneUnmark') : t('cardDoneMark')}
      title={on ? t('cardDoneUnmark') : t('cardDoneMark')}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        toggle()
      }}
      className={`flex shrink-0 items-center justify-center rounded-full transition-colors ${box} ${
        on
          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
          : 'border-2 border-foreground/40 text-transparent hover:border-foreground/70 hover:bg-black/5 dark:hover:bg-white/10'
      } ${className}`}
    >
      <Check className={large ? 'h-4 w-4' : 'h-3 w-3'} strokeWidth={3} aria-hidden />
    </button>
  )
}
