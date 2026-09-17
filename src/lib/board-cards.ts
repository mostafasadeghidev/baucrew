/**
 * What a card on the project board says beyond its name: the colour a label
 * or a person wears, the initials in an avatar, when a date is coloured, and
 * the filter above the board. Pure, so every rule is tested without a
 * database.
 */

/** How many colours a label or a person can wear. */
export const SWATCHES = 8

/**
 * Which of the colours a key gets — the same one on every card and every
 * visit, settled by the key alone so no list has to be kept.
 */
export function swatchOf(key: string): number {
  let hash = 0
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return hash % SWATCHES
}

/** The letters an avatar shows: the first of the first two words, "Max Muster" → "MM". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

export type DateTone = 'late' | 'soon' | null

const OVER = new Set(['COMPLETED', 'INVOICED', 'PAID', 'CANCELLED'])
const NOT_STARTED = new Set(['LEAD', 'QUOTED', 'APPROVED', 'PLANNED'])
const DAY = 24 * 60 * 60 * 1000

/**
 * Whether a card's dates are coloured: red once the planned end has passed
 * and the job is not over, amber when a job that has not started is due to
 * start within the next days. Finished, billed and cancelled jobs wear no
 * colour — their dates are history.
 */
export function dateTone(
  status: string,
  plannedStart: Date | null,
  plannedEnd: Date | null,
  today: Date,
  soonDays = 7
): DateTone {
  if (OVER.has(status)) return null
  if (plannedEnd && plannedEnd.getTime() < today.getTime()) return 'late'
  if (NOT_STARTED.has(status) && plannedStart) {
    const ahead = plannedStart.getTime() - today.getTime()
    if (ahead >= 0 && ahead <= soonDays * DAY) return 'soon'
  }
  return null
}

/** The filter above the board: one person, one trade, urgent only — each in the address. */
export type BoardFilter = { member: string | null; label: string | null; urgent: boolean }

export const BOARD_FILTER_PARAMS = ['member', 'label', 'urgent'] as const

export function parseBoardFilter(params: { member?: string; label?: string; urgent?: string }): BoardFilter {
  return {
    member: params.member?.trim() || null,
    label: params.label?.trim() || null,
    urgent: params.urgent === '1',
  }
}

/** How many of the three are set — the badge on the filter button. */
export function boardFilterCount(filter: BoardFilter): number {
  return (filter.member ? 1 : 0) + (filter.label ? 1 : 0) + (filter.urgent ? 1 : 0)
}
