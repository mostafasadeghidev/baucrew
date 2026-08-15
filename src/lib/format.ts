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

export function formatCurrency(value: number | null | undefined, locale: string): string {
  if (value == null) return '—'
  return new Intl.NumberFormat(DATE_LOCALES[locale] ?? 'de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

/** yyyy-mm-dd for <input type="date"> values (UTC calendar date). */
export function toDateInputValue(date: Date | null | undefined): string {
  if (!date) return ''
  return date.toISOString().slice(0, 10)
}
