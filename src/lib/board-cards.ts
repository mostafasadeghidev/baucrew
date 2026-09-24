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

/**
 * The colours a label can wear, in the order the palettes in
 * components/swatches list them. Every trade has one of its own — given in
 * the order the trades stand when the colours came, chosen under
 * Einstellungen since; only a trade without one falls back on `swatchOf`.
 */
export const LABEL_COLORS = ['sky', 'emerald', 'amber', 'rose', 'violet', 'teal', 'orange', 'indigo', 'lime', 'pink'] as const
export type LabelColor = (typeof LABEL_COLORS)[number]

/** A colour as the form sent it, or null — none sent, or not one of ours. */
export function labelColorKey(raw: string | null | undefined): LabelColor | null {
  return raw && (LABEL_COLORS as readonly string[]).includes(raw) ? (raw as LabelColor) : null
}

/** Where in the palettes a label's colour stands: the one chosen for it, else the one its key gets. */
export function labelSwatch(color: string | null | undefined, key: string): number {
  const chosen = labelColorKey(color)
  return chosen ? LABEL_COLORS.indexOf(chosen) : swatchOf(key)
}

/**
 * The colour a new trade gets when none was picked: the one the fewest trades
 * wear, the earliest of those — so ten trades are ten colours before any
 * repeats.
 */
export function nextLabelColor(used: Array<string | null | undefined>): LabelColor {
  const counts = LABEL_COLORS.map((color) => used.filter((u) => u === color).length)
  return LABEL_COLORS[counts.indexOf(Math.min(...counts))]
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

/**
 * Whether the day a job is due by is coloured: red once it has passed and the
 * job is not over, amber within the next days — whatever the status, because
 * a promise presses on a running job as much as on one that has not begun.
 */
export function dueTone(status: string, dueDate: Date | null, today: Date, soonDays = 7): DateTone {
  if (!dueDate || OVER.has(status)) return null
  const ahead = dueDate.getTime() - today.getTime()
  if (ahead < 0) return 'late'
  return ahead <= soonDays * DAY ? 'soon' : null
}

/** A site on one line: "Musterstraße 1, 12345 Musterstadt" — or what there is of it. */
export function addressLine(street: string | null, postalCode: string | null, city: string | null): string | null {
  const town = [postalCode, city].map((part) => part?.trim()).filter(Boolean).join(' ')
  const line = [street?.trim(), town].filter(Boolean).join(', ')
  return line || null
}

/**
 * When a card is due, the way Trello's filter asks: past its day, due within
 * the week or the month, or without a day at all (no planned start and no
 * due date).
 */
export const DUE_FILTERS = ['overdue', 'week', 'month', 'none'] as const
export type DueFilter = (typeof DUE_FILTERS)[number]

export function dueFilterKey(raw: unknown): DueFilter | null {
  return typeof raw === 'string' && (DUE_FILTERS as readonly string[]).includes(raw) ? (raw as DueFilter) : null
}

/** The filter above the board: one person, one trade, urgent only, a due — each in the address. */
export type BoardFilter = { member: string | null; label: string | null; urgent: boolean; due: DueFilter | null }

export const BOARD_FILTER_PARAMS = ['member', 'label', 'urgent', 'due'] as const

export function parseBoardFilter(params: { member?: string; label?: string; urgent?: string; due?: string }): BoardFilter {
  return {
    member: params.member?.trim() || null,
    label: params.label?.trim() || null,
    urgent: params.urgent === '1',
    due: dueFilterKey(params.due),
  }
}

/** How many of the four are set — the badge on the filter button. */
export function boardFilterCount(filter: BoardFilter): number {
  return (filter.member ? 1 : 0) + (filter.label ? 1 : 0) + (filter.urgent ? 1 : 0) + (filter.due ? 1 : 0)
}

/**
 * The days a due filter spans, from today: `[from, to)` on the due date, or
 * null bounds for "none", which asks for no day at all.
 */
export function dueFilterRange(due: DueFilter, today: Date): { from: Date | null; to: Date | null } {
  const day = (offset: number) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offset))
  switch (due) {
    case 'overdue':
      return { from: null, to: day(0) }
    case 'week':
      return { from: day(0), to: day(8) }
    case 'month':
      return { from: day(0), to: day(31) }
    case 'none':
      return { from: null, to: null }
  }
}
