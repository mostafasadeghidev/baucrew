/**
 * The site overview (Baustellen): every project that is being built right now,
 * and the ones about to start, each with what still hangs on it — open tasks,
 * open defects, forms waiting for a signature, checklists half ticked — and
 * when the crew is next on it. Nothing here is entered twice: it is all read
 * off the project.
 *
 * Pure logic; the page in src/app/(admin)/sites reads the database.
 */

/** How far ahead "about to start" reaches, in days. */
export const SOON_DAYS = 14

export type SiteCounts = {
  openTasks: number
  overdueTasks: number
  openDefects: number
  overdueDefects: number
  photos: number
  /** Forms not yet signed by everybody. */
  openForms: number
  signedForms: number
  checklistDone: number
  checklistTotal: number
}

export type SiteRow = {
  id: string
  number: string
  name: string
  status: string
  customer: string
  /** Street and town, as one line. */
  place: string | null
  manager: string | null
  crew: number
  plannedStart: Date | null
  plannedEnd: Date | null
  /** The next assignment on or after today, and the last one before it. */
  nextDate: Date | null
  lastDate: Date | null
  counts: SiteCounts
}

export type SiteFlag = 'overdueTasks' | 'overdueDefects' | 'openForms' | 'noCrew' | 'noAssignment'

/**
 * What the site lead should look at first: work past its day, a form
 * nobody has signed, a running site with no crew or nothing planned.
 * The order is the order they are shown in.
 */
export function siteFlags(row: Pick<SiteRow, 'status' | 'crew' | 'nextDate' | 'counts'>): SiteFlag[] {
  const flags: SiteFlag[] = []
  if (row.counts.overdueDefects > 0) flags.push('overdueDefects')
  if (row.counts.overdueTasks > 0) flags.push('overdueTasks')
  if (row.counts.openForms > 0) flags.push('openForms')
  if (row.status === 'IN_PROGRESS') {
    if (row.crew === 0) flags.push('noCrew')
    if (!row.nextDate) flags.push('noAssignment')
  }
  return flags
}

/**
 * Running sites first, then the ones about to start. Within each: whatever
 * has the crew on it soonest at the top; sites with nothing planned at the
 * end of their group, by number.
 */
export function sortSites<T extends Pick<SiteRow, 'status' | 'nextDate' | 'number'>>(rows: T[]): T[] {
  const rank = (r: T) => (r.status === 'IN_PROGRESS' ? 0 : 1)
  return [...rows].sort((a, b) => {
    const byGroup = rank(a) - rank(b)
    if (byGroup !== 0) return byGroup
    if (a.nextDate && b.nextDate) {
      const byDate = a.nextDate.getTime() - b.nextDate.getTime()
      if (byDate !== 0) return byDate
    } else if (a.nextDate || b.nextDate) {
      return a.nextDate ? -1 : 1
    }
    return b.number.localeCompare(a.number)
  })
}

/** Counts a list of due days: how many are open, how many of those are past `today`. */
export function countDue(items: Array<{ dueDate: Date | null }>, today: Date): { open: number; overdue: number } {
  let overdue = 0
  for (const item of items) if (item.dueDate && item.dueDate.getTime() < today.getTime()) overdue += 1
  return { open: items.length, overdue }
}

/** Checked and total across a project's checklists. */
export function checklistProgress(lists: Array<{ items: Array<{ checkedAt: Date | null }> }>): {
  done: number
  total: number
} {
  let done = 0
  let total = 0
  for (const list of lists) {
    total += list.items.length
    for (const item of list.items) if (item.checkedAt) done += 1
  }
  return { done, total }
}
