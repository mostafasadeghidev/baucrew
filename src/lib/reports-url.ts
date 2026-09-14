/**
 * Where an old address of the CRM page belongs now.
 *
 * The page had eight tabs and has six: Heute, Vergleich, Aufträge & Baustellen,
 * Planumsatz, Auslastung and Datenlücken. A bookmark, a link on the dashboard or
 * an address somebody sent
 * must still land on the tab that took over the old one's content — not on an
 * empty page, and not on the wrong year. Returns the new address, or null when
 * the address is already a current one.
 *
 * Pure, so the mapping is tested without a request.
 */

/** The current tabs, in the order they stand; the empty value is Heute. */
export const REPORT_TABS = ['', 'compare', 'jobs', 'revenue', 'utilization', 'quality'] as const
export type ReportTab = (typeof REPORT_TABS)[number]

/** The time frame travels with every redirect. */
const TIME = ['year', 'period']
/** The revenue tab's own choices, kept when an old address already pointed at it. */
const REVENUE_CHOICES = ['order', 'layout', 'per']
/** The Vergleich tab's choices: the chart, the years it holds and the quarter card. */
const COMPARE = ['compare', 'chart', 'qyear', 'qcompare']

/**
 * The choices that belong to one tab only. Switching the main tab drops them,
 * so a choice made on one tab never follows the office onto another — and an
 * address without a tab that still carries the comparison's choices can only
 * be an old overview link.
 */
/** The Aufträge & Baustellen tab's own choice: the sites as cards or as a kanban. */
const JOBS_CHOICES = ['sites']

export const TAB_CHOICES = ['view', 'open', ...REVENUE_CHOICES, ...COMPARE, ...JOBS_CHOICES]

export function resolveReportsUrl(params: Record<string, string | undefined>): string | null {
  const tab = params.tab ?? ''
  const next = new URLSearchParams()
  const set = (key: string, value: string) => next.set(key, value)
  const keep = (keys: string[]) => {
    for (const key of keys) {
      const value = params[key]
      // An empty comparison is a choice — every year taken out — not an absence.
      if (value !== undefined && (value !== '' || COMPARE.includes(key))) next.set(key, value)
    }
  }
  const address = () => {
    const query = next.toString()
    return query ? `/reports?${query}` : '/reports'
  }
  const hadComparison = COMPARE.some((key) => params[key] !== undefined)
  const toComparison = () => {
    set('tab', 'compare')
    keep([...TIME, ...COMPARE])
    return address()
  }

  switch (tab) {
    case '':
      // The overview used to be the tab without a name; its comparison links
      // carried the chart's choices and no view.
      return hadComparison && params.view === undefined ? toComparison() : null
    case 'compare':
    case 'jobs':
    case 'utilization':
    case 'quality':
      return null
    case 'revenue':
      // The comparison was a view of Planumsatz, and the running sum one before
      // it; both are the Vergleich tab now. The months' layout stays behind.
      return params.view === 'compare' || params.view === 'cumulative' ? toComparison() : null
    case 'overview':
      // Somebody who had set up the comparison chart wants the comparison.
      if (hadComparison) return toComparison()
      keep(TIME)
      return address()
    case 'offers':
      keep(TIME)
      set('open', 'offers')
      return address()
    case 'projects':
      set('tab', 'utilization')
      keep(TIME)
      return address()
    case 'customers':
      set('tab', 'revenue')
      set('view', 'customers')
      keep(TIME)
      return address()
    // 'cockpit' and anything unknown open Heute.
    default:
      keep(TIME)
      return address()
  }
}
