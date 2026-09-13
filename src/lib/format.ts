const DATE_LOCALES: Record<string, string> = {
  de: 'de-DE',
  en: 'en-GB',
  fa: 'de-DE', // test locale: keep Latin digits / German formats
}

export function formatDate(date: Date | null | undefined, locale: string): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat(DATE_LOCALES[locale] ?? 'de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

export function formatCurrency(
  value: number | null | undefined,
  locale: string,
  { whole = false }: { whole?: boolean } = {}
): string {
  if (value == null) return '—'
  return new Intl.NumberFormat(DATE_LOCALES[locale] ?? 'de-DE', {
    style: 'currency',
    currency: 'EUR',
    // Whole euros, rounded, where a figure has to fit a narrow card.
    ...(whole ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}),
  }).format(value)
}

/**
 * Thousands of euros in the few characters a matrix cell holds: "12,6 T€" in
 * German, "€12.6k" in English. One decimal at most.
 */
export function formatThousands(value: number, locale: string): string {
  const n = (value / 1000).toLocaleString(DATE_LOCALES[locale] ?? 'de-DE', { maximumFractionDigits: 1 })
  return locale === 'en' ? `€${n}k` : `${n} T€`
}

/** yyyy-mm-dd for <input type="date"> values (UTC calendar date). */
export function toDateInputValue(date: Date | null | undefined): string {
  if (!date) return ''
  return date.toISOString().slice(0, 10)
}
