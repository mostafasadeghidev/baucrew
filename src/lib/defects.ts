/**
 * Defects on a site — Mängel: something that is not right and has to be put
 * right. Noticed by the crew or the office, shown with photos, given to
 * somebody, open until it is marked done.
 *
 * Pure, so the rules are tested without a database.
 */

export const DEFECT_TITLE_MAX = 200
export const DEFECT_TEXT_MAX = 2000
export const DEFECT_LOCATION_MAX = 120

export type DefectResult = { error?: 'titleRequired' | 'notAllowed' | 'notFound' | 'saveFailed'; id?: string }

/** What a defect is made of, as it is typed in. */
export type DefectInput = {
  title: string
  description: string | null
  location: string | null
  /** yyyy-mm-dd, or null. */
  dueDate: string | null
  assigneeId: string | null
}

const clean = (value: unknown, max: number): string | null => {
  const text = typeof value === 'string' ? value.trim().slice(0, max) : ''
  return text || null
}

/** A defect as a form or an automation sends it; null when it has no title. */
export function parseDefectInput(raw: {
  title?: unknown
  description?: unknown
  location?: unknown
  dueDate?: unknown
  assigneeId?: unknown
}): DefectInput | null {
  const title = clean(raw.title, DEFECT_TITLE_MAX)
  if (!title) return null
  const due = clean(raw.dueDate, 10)
  return {
    title,
    description: clean(raw.description, DEFECT_TEXT_MAX),
    location: clean(raw.location, DEFECT_LOCATION_MAX),
    dueDate: due && /^\d{4}-\d{2}-\d{2}$/.test(due) && !Number.isNaN(Date.parse(`${due}T00:00:00Z`)) ? due : null,
    assigneeId: clean(raw.assigneeId, 60),
  }
}

export type DefectTone = 'late' | 'soon' | null

const DAY = 24 * 60 * 60 * 1000

/**
 * Whether an open defect's day presses: red once it has passed, amber within
 * the next days. One that is done, or has no day, wears no colour.
 */
export function defectTone(dueDate: Date | null, resolvedAt: Date | null, today: Date, soonDays = 3): DefectTone {
  if (!dueDate || resolvedAt) return null
  const ahead = dueDate.getTime() - today.getTime()
  if (ahead < 0) return 'late'
  return ahead <= soonDays * DAY ? 'soon' : null
}

type Sortable = { resolvedAt: Date | null; dueDate: Date | null; createdAt: Date }

/**
 * The order a list of defects is read in: the open ones first — the one due
 * soonest on top, those without a day after them, oldest first — then what is
 * done, the latest on top.
 */
export function sortDefects<T extends Sortable>(defects: T[]): T[] {
  return [...defects].sort((a, b) => {
    if (!a.resolvedAt !== !b.resolvedAt) return a.resolvedAt ? 1 : -1
    if (a.resolvedAt && b.resolvedAt) return b.resolvedAt.getTime() - a.resolvedAt.getTime()
    const dueA = a.dueDate?.getTime() ?? Infinity
    const dueB = b.dueDate?.getTime() ?? Infinity
    if (dueA !== dueB) return dueA - dueB
    return a.createdAt.getTime() - b.createdAt.getTime()
  })
}

/**
 * Who may take a defect away: the office any, and whoever reported it their
 * own while it is still open — a slip of the thumb on the site is taken back
 * by the thumb that made it.
 */
export function canDeleteDefect(
  user: { id: string; role: string },
  defect: { reportedById: string | null; resolvedAt: Date | null }
): boolean {
  if (user.role !== 'EMPLOYEE') return true
  return defect.reportedById === user.id && !defect.resolvedAt
}

/** A defect as a list draws it: everything already in words. */
export type DefectRow = {
  id: string
  title: string
  description: string | null
  location: string | null
  /** The day it is due, already formatted, and whether it presses. */
  due: { text: string; tone: DefectTone } | null
  assignee: string | null
  /** "Max Muster · 21.09.26" */
  reported: string
  /** "Max Muster · 22.09.26" once it is done; null while it is open. */
  resolved: string | null
  photos: Array<{ id: string; filename: string }>
  /** Whether the reader may take it away. */
  deletable: boolean
}

type Person = { username: string; employee: { firstName: string; lastName: string } | null } | null

/** A defect as it is read from the database for a list. */
export type DefectRecord = {
  id: string
  title: string
  description: string | null
  location: string | null
  dueDate: Date | null
  createdAt: Date
  resolvedAt: Date | null
  reportedById: string | null
  assignee: { firstName: string; lastName: string } | null
  reportedBy: Person
  resolvedBy: Person
  photos: Array<{ id: string; filename: string }>
}

const personName = (person: Person): string | null =>
  person ? (person.employee ? `${person.employee.firstName} ${person.employee.lastName}`.trim() : person.username) : null

/** The rows of a defect list, in reading order, for one reader. */
export function defectRows(
  records: DefectRecord[],
  reader: { id: string; role: string },
  today: Date,
  formatDay: (date: Date) => string
): DefectRow[] {
  const signed = (who: Person, when: Date) => [personName(who), formatDay(when)].filter(Boolean).join(' · ')
  return sortDefects(records).map((d) => ({
    id: d.id,
    title: d.title,
    description: d.description,
    location: d.location,
    due: d.dueDate ? { text: formatDay(d.dueDate), tone: defectTone(d.dueDate, d.resolvedAt, today) } : null,
    assignee: d.assignee ? `${d.assignee.firstName} ${d.assignee.lastName}`.trim() : null,
    reported: signed(d.reportedBy, d.createdAt),
    resolved: d.resolvedAt ? signed(d.resolvedBy, d.resolvedAt) : null,
    photos: d.photos,
    deletable: canDeleteDefect(reader, d),
  }))
}
