// Shared locale constants — safe to import from both server and client code.
// The app ships German (default) and English. Additional test locales can be
// enabled locally without touching the repo: put messages/<code>.json next to
// de.json/en.json (git-ignored) and set NEXT_PUBLIC_EXTRA_LOCALES=<code> in .env.
const BASE_LOCALES = ['de', 'en'] as const
const EXTRA_LOCALES = (process.env.NEXT_PUBLIC_EXTRA_LOCALES ?? '')
  .split(',')
  .map((l) => l.trim())
  .filter(Boolean)

export const LOCALES: readonly string[] = [...BASE_LOCALES, ...EXTRA_LOCALES]
export type AppLocale = string
export const DEFAULT_LOCALE: AppLocale = 'de'

export function isLocale(value: string | undefined): value is AppLocale {
  return value != null && LOCALES.includes(value)
}
