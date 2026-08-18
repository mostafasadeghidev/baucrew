'use client'

import { useLocale } from 'next-intl'
import { useTransition } from 'react'
import { setLocale } from '@/app/actions'
import { LOCALES, type AppLocale } from '@/i18n/config'

export function LanguageSwitcher({ compact = false }: { compact?: boolean } = {}) {
  const locale = useLocale()
  const [, startTransition] = useTransition()

  function switchTo(next: AppLocale) {
    if (next === locale) return
    startTransition(() => setLocale(next))
  }

  return (
    <div
      className={`flex items-center gap-0.5 rounded-md p-0.5 text-xs font-semibold ${compact ? 'bg-subtle' : 'border border-border'}`}
      role="group"
      aria-label="Sprache / Language"
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => switchTo(l)}
          className={`rounded px-2 py-1 uppercase transition-colors ${
            l === locale
              ? 'bg-surface text-foreground shadow-sm'
              : 'text-muted hover:text-foreground'
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}
