import { OFFICE_TIME_ZONE } from './due-reminder'

const DATE_LOCALES: Record<string, string> = {
  de: 'de-DE',
  en: 'en-GB',
  fa: 'de-DE', // test locale: keep Latin digits / German formats
}

/**
 * A moment that is none — `new Date('irgendwann')` — is shown as nothing,
 * not thrown at the page: Intl refuses an invalid date, and a stamp from
 * another system is not always one.
 */
const readable = (date: Date | null | undefined): date is Date => date instanceof Date && !Number.isNaN(date.getTime())

export function formatDate(date: Date | null | undefined, locale: string): string {
  if (!readable(date)) return '—'
  return new Intl.DateTimeFormat(DATE_LOCALES[locale] ?? 'de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

/**
 * Date and time, for "when was this read last" stamps (sync lines and the
 * like). A real moment, not a calendar day — so it is shown in the office's
 * time, not in UTC like the dates above.
 */
export function formatDateTime(date: Date | null | undefined, locale: string): string {
  if (!readable(date)) return '—'
  return new Intl.DateTimeFormat(DATE_LOCALES[locale] ?? 'de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: OFFICE_TIME_ZONE,
  }).format(date)
}

/** The calendar day of a real moment, as the office lives it (Berlin), not UTC's day. */
export function formatOfficeDate(date: Date | null | undefined, locale: string): string {
  if (!readable(date)) return '—'
  return new Intl.DateTimeFormat(DATE_LOCALES[locale] ?? 'de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: OFFICE_TIME_ZONE,
  }).format(date)
}

/**
 * Whole office days between a moment and now: 0 is today, 1 yesterday —
 * counted by Berlin's calendar, so a scan at 00:30 is "today" there even
 * while UTC still says yesterday.
 */
export function officeDaysAgo(date: Date, now: Date): number {
  if (!readable(date) || !readable(now)) return 0
  const day = (d: Date) => {
    const [y, m, dd] = new Intl.DateTimeFormat('en-CA', { timeZone: OFFICE_TIME_ZONE }).format(d).split('-').map(Number)
    return Date.UTC(y, m - 1, dd)
  }
  return Math.max(0, Math.round((day(now) - day(date)) / 86_400_000))
}

/** The cookie a browser keeps when prices are to be hidden — set from the user menu. */
export const HIDE_PRICES_COOKIE = 'hide-prices'

/**
 * What stands in for an amount while prices are hidden: asterisks and no
 * digits, always as many, so nothing is given away about its size either.
 */
export const PRICE_MASK = '****'

/**
 * An amount in euros. `hidden` puts the asterisks in its place, for a screen
 * somebody else can see; a missing amount stays a dash, which tells nothing.
 */
export function formatCurrency(
  value: number | null | undefined,
  locale: string,
  { whole = false, hidden = false }: { whole?: boolean; hidden?: boolean } = {}
): string {
  if (value == null) return '—'
  if (hidden) return locale === 'en' ? `€${PRICE_MASK}` : `${PRICE_MASK} €`
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
export function formatThousands(value: number, locale: string, hidden = false): string {
  if (hidden) return locale === 'en' ? `€${PRICE_MASK}k` : `${PRICE_MASK} T€`
  const n = (value / 1000).toLocaleString(DATE_LOCALES[locale] ?? 'de-DE', { maximumFractionDigits: 1 })
  return locale === 'en' ? `€${n}k` : `${n} T€`
}

/** yyyy-mm-dd for <input type="date"> values (UTC calendar date). */
export function toDateInputValue(date: Date | null | undefined): string {
  if (!date) return ''
  return date.toISOString().slice(0, 10)
}
