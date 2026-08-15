'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

/**
 * Small "Saved ✓" confirmation that appears whenever `trigger` changes to a new
 * truthy value and fades out after a few seconds. Render it near the save button.
 */
export function SavedToast({ trigger, duration = 3000 }: { trigger: number | string | boolean | undefined; duration?: number }) {
  const tc = useTranslations('common')
  const [visibleFor, setVisibleFor] = useState<typeof trigger>(undefined)

  useEffect(() => {
    if (!trigger) return
    const show = setTimeout(() => setVisibleFor(trigger), 0)
    const hide = setTimeout(() => setVisibleFor(undefined), duration)
    return () => {
      clearTimeout(show)
      clearTimeout(hide)
    }
  }, [trigger, duration])

  if (!visibleFor) return null
  return (
    <span
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-medium text-emerald-700 dark:text-emerald-400"
    >
      <span aria-hidden>✓</span>
      {tc('saved')}
    </span>
  )
}
