'use client'

import { useLocale } from 'next-intl'
import { useTransition } from 'react'
import { setLocale } from '@/app/actions'
import { LOCALES, type AppLocale } from '@/i18n/config'

export function LanguageSwitcher() {
  const locale = useLocale()
  const [, startTransition] = useTransition()

  function switchTo(next: AppLocale) {
    if (next === locale) return
    startTransition(() => setLocale(next))
  }

  return (
    <div
      className="flex items-center overflow-hidden rounded-md border border-border text-xs font-semibold"
      role="group"
      aria-label="Sprache / Language"
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => switchTo(l)}
          className={`px-2.5 py-1.5 uppercase transition-colors ${
            l === locale
              ? 'bg-accent text-accent-foreground'
              : 'text-muted hover:bg-surface-hover hover:text-foreground'
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}
