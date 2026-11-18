/**
 * What still hangs on a site, as the small markers on its card: work past its
 * day, a form nobody has signed, a running site with no crew or nothing
 * planned. They used to be the Baustellen list's own; since Baustellen is the
 * running-jobs board (docs/CHANGE-baustellen-board.md) they stand on the
 * cards — on that board and on every other board the card stands on. Nothing
 * here is entered twice: it is all read off the project.
 *
 * Pure logic; the board page (src/app/(admin)/projects/projects-board.tsx)
 * reads the database.
 */

/** What the markers are worked out from. */
export type SiteFacts = {
  status: string
  /** People in the crew (the team), the site manager not counted. */
  crew: number
  /** The next assignment on or after today, if any. */
  nextDate: Date | null
  counts: {
    /** Open tasks whose day is past. */
    overdueTasks: number
    /** Open defects whose day is past. */
    overdueDefects: number
    /** Forms not yet signed by everybody. */
    openForms: number
  }
}

export type SiteFlag = 'overdueTasks' | 'overdueDefects' | 'openForms' | 'noCrew' | 'noAssignment'

/**
 * What the site lead should look at first: work past its day, a form
 * nobody has signed, a running site with no crew or nothing planned.
 * The order is the order they are shown in.
 */
export function siteFlags(row: SiteFacts): SiteFlag[] {
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
 * Which projects need their next assignment looked up: only a running site
 * is asked for one, so only those go to the schedule.
 */
export function needsNextDate(projects: Array<{ id: string; status: string }>): string[] {
  return projects.filter((p) => p.status === 'IN_PROGRESS').map((p) => p.id)
}
