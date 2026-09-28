/**
 * The bell's news of a card, the way Trello sends it: what happened reaches
 * the card's members and those who follow it ("Beobachten"), never the one
 * who did it. A site manager hears of a card only while named on it — the
 * board shows them no other — and the crew, who have no board, hear nothing
 * here. What the office wrote for itself reaches only the office.
 *
 * Pure: who gets a line and what it says are tested without a database.
 */

export const NOTIFY_KINDS = ['comment', 'moved', 'added', 'attachment', 'dates', 'done', 'archived', 'restored', 'due', 'checkItem'] as const
export type NotifyKind = (typeof NOTIFY_KINDS)[number]

export type NotifyCandidate = {
  userId: string
  role: string
  /** On the card: its site manager or in its crew. */
  member: boolean
  /** Follows the card. */
  watching: boolean
}

export function recipientsFor(input: {
  actorId: string | null
  candidates: NotifyCandidate[]
  /** Written for the office only: a site manager may not read it. */
  officeOnly?: boolean
  /** Told already some other way — named in the comment, say. */
  except?: string[]
}): string[] {
  const except = new Set(input.except ?? [])
  const chosen = input.candidates.filter(
    (c) =>
      c.userId !== input.actorId &&
      c.role !== 'EMPLOYEE' &&
      !except.has(c.userId) &&
      (c.member || c.watching) &&
      (c.role !== 'SITE_MANAGER' || c.member) &&
      (!input.officeOnly || c.role === 'ADMIN' || c.role === 'MANAGER')
  )
  return [...new Set(chosen.map((c) => c.userId))]
}

/** Translates a bell line's key with its values. */
export type NotifyWords = (key: string, values?: Record<string, string>) => string

const DAY = 86_400_000

/**
 * The words of a line: who did what — "hat kommentiert: …", "hat die Karte
 * nach „Geplant“ verschoben" — or, for a day coming due, how near it is.
 */
export function notificationLine(
  kind: string,
  text: string | null,
  words: NotifyWords,
  statusLabel: (status: string) => string,
  today: Date,
  /** A day as the reader writes it; the ISO day by default. */
  formatDay: (iso: string) => string = (iso) => iso
): string {
  switch (kind) {
    case 'comment':
      return words('nComment', { text: text ?? '' })
    case 'moved':
      return words('nMoved', { list: text ? statusLabel(text) : '—' })
    case 'added':
      return words('nAdded')
    case 'checkItem':
      return words('nCheckItem', { text: text ?? '' })
    case 'attachment':
      return words('nAttachment', { name: text ?? '' })
    case 'dates':
      return words('nDates')
    case 'done':
      return words('nDone')
    case 'archived':
      return words('nArchived')
    case 'restored':
      return words('nRestored')
    case 'due': {
      // "2026-09-29", or "2026-09-29 14:00" when the card is due at a time.
      const [day, time] = (text ?? '').split(' ')
      const due = day ? Date.parse(`${day}T00:00:00.000Z`) : NaN
      if (Number.isNaN(due)) return words('nDueOn', { date: text ?? '' })
      const days = Math.round((due - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / DAY)
      if (days < 0) return words('nOverdue')
      if (days === 0) return time ? words('nDueTodayAt', { time }) : words('nDueToday')
      if (days === 1) return time ? words('nDueTomorrowAt', { time }) : words('nDueTomorrow')
      return time ? words('nDueOnAt', { date: formatDay(day), time }) : words('nDueOn', { date: formatDay(day) })
    }
    default:
      return words('nUpdated')
  }
}
