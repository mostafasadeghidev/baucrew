/**
 * Where an old address of the reporting page belongs now.
 *
 * The page (once called CRM) had eight tabs, then seven with Heute first, and
 * has four: Vergleich, Planumsatz, Auslastung and Datenlücken. A bookmark, a
 * link on the dashboard or an address somebody sent must still land on the tab
 * that took over the old one's content — not on an empty page, and not on the
 * wrong year. Returns the new address, or null when the address is already a
 * current one.
 *
 * Pure, so the mapping is tested without a request.
 */

/** The current tabs, in the order they stand; the empty value is Vergleich. */
export const REPORT_TABS = ['', 'revenue', 'utilization', 'quality'] as const
export type ReportTab = (typeof REPORT_TABS)[number]

/** The time frame travels with every redirect. */
const TIME = ['year', 'period']
/** The revenue tab's own choices, kept when an old address already pointed at it. */
const REVENUE_CHOICES = ['order', 'layout', 'per']
/** The Vergleich tab's choices: the chart, the years it holds and the quarter card. */
const COMPARE = ['compare', 'chart', 'qyear', 'qcompare']
/** The Datenlücken tab's own choice: the one kind of gap the list is narrowed to. */
const GAP_CHOICES = ['gap']

/**
 * The choices that belong to one tab only. Switching the main tab drops them,
 * so a choice made on one tab never follows the office onto another.
 */
export const TAB_CHOICES = ['view', ...REVENUE_CHOICES, ...COMPARE, ...GAP_CHOICES]

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
  /** Vergleich is the tab without a name; the chart's choices go along. */
  const toComparison = () => {
    keep([...TIME, ...COMPARE])
    return address()
  }

  switch (tab) {
    case '':
      // Heute took `open` for the tile whose sheet stood open, and the overview
      // before it `view`; neither means anything on Vergleich.
      return params.open !== undefined || params.view !== undefined ? toComparison() : null
    case 'utilization':
    case 'quality':
      return null
    case 'compare':
    case 'overview':
    case 'cockpit':
    // Aufträge & Baustellen and the Pipeline were working lists of the
    // projects; they were taken off, and the projects' boards hold that work.
    case 'jobs':
    case 'pipeline':
    case 'offers':
      // Vergleich had a name of its own while Heute stood first; the overview
      // and the cockpit were what Heute replaced; the old offers tab went to
      // Heute and then the Pipeline.
      return toComparison()
    case 'revenue':
      // The comparison was a view of Planumsatz, and the running sum one before
      // it; both are the Vergleich tab now. The months' layout stays behind.
      if (params.view === 'compare' || params.view === 'cumulative') return toComparison()
      if (params.view === undefined && params.layout !== 'matrix') return null
      // Baustellen and Kunden were views of Planumsatz too, and the year
      // matrix one of its layouts; the months are what is left.
      set('tab', 'revenue')
      keep([...TIME, ...REVENUE_CHOICES.filter((key) => key !== 'layout' || params.layout !== 'matrix')])
      if (params.layout === 'matrix') next.delete('per')
      return address()
    case 'projects':
      set('tab', 'utilization')
      keep(TIME)
      return address()
    case 'customers':
      set('tab', 'revenue')
      keep(TIME)
      return address()
    // Anything unknown opens Vergleich.
    default:
      keep(TIME)
      return address()
  }
}
