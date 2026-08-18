'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'

/**
 * Badge-styled <select> that saves immediately on change — used in detail
 * headers so a status change no longer requires opening the edit form.
 */
export function QuickStatus({
  value,
  options,
  colorClass,
  onChange,
  ariaLabel,
}: {
  value: string
  options: Array<{ value: string; label: string }>
  /** Tailwind classes for the current value's badge look. */
  colorClass: string
  onChange: (next: string) => Promise<{ error?: string }>
  ariaLabel: string
}) {
  const tc = useTranslations('common')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <span className="inline-flex flex-col">
      <span className="relative inline-flex items-center">
        <select
          value={value}
          disabled={pending}
          aria-label={ariaLabel}
          onChange={(e) => {
            const next = e.target.value
            setError(null)
            startTransition(async () => {
              const result = await onChange(next)
              if (result.error) setError(tc('saveFailed'))
            })
          }}
          className={`cursor-pointer appearance-none rounded-md border border-transparent py-1 pl-2.5 pr-7 text-xs font-medium shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 ${colorClass}`}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} className="bg-surface text-foreground">
              {o.label}
            </option>
          ))}
        </select>
        <svg
          viewBox="0 0 20 20"
          aria-hidden
          className="pointer-events-none absolute right-2 h-3 w-3 opacity-70"
          fill="currentColor"
        >
          <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
        </svg>
      </span>
      {error && (
        <span role="alert" className="mt-1 text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  )
}
