'use client'

/**
 * The office's job number under a card's name, small and quiet, the way it
 * sat in brackets behind the title in Trello. Pointing at it shows a copy
 * mark; a click puts the number on the clipboard and ticks for a moment.
 */

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Copy } from 'lucide-react'

export function JobNumber({ value, className = '' }: { value: string; className?: string }) {
  const t = useTranslations('projects')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <button
      type="button"
      title={copied ? t('jobNumberCopied') : t('jobNumberCopy')}
      aria-label={`${t('jobNumber')} ${value} – ${t('jobNumberCopy')}`}
      onClick={(e) => {
        // On a board card the click must not open the card behind it.
        e.preventDefault()
        e.stopPropagation()
        void navigator.clipboard?.writeText(value).then(
          () => setCopied(true),
          () => {}
        )
      }}
      className={`group/job inline-flex items-center gap-1 rounded text-xs tabular-nums text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
    >
      <span>{value}</span>
      {copied ? (
        <Check aria-hidden className="h-3 w-3 text-emerald-700 dark:text-emerald-400" />
      ) : (
        <Copy
          aria-hidden
          className="h-3 w-3 opacity-0 transition-opacity group-hover/job:opacity-100 group-focus-visible/job:opacity-100 [@media(hover:none)]:opacity-100"
        />
      )}
      <span aria-live="polite" className="sr-only">
        {copied ? t('jobNumberCopied') : ''}
      </span>
    </button>
  )
}
