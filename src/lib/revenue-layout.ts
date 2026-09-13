/**
 * How the revenue tab draws its months, and how much of them one screen holds.
 *
 * Three layouts of the same figures:
 * - the grid: a card per month, wrapping into rows of the chosen number — the
 *   tab as it always was, with fewer, larger cards or more, smaller ones;
 * - the lanes: a column per month and the month's sites as tiles in two lanes
 *   across them, own people above and SUB below, like the project board — so
 *   each lane and its sum run the whole way across at one height;
 * - the year matrix: a row per site against a column per month, so a job that
 *   runs from March into June is one bar, and the year is one table.
 *
 * The choice is kept in a cookie, like the sidebar's, so the tab opens the way
 * it was left. The address carries it as well, so a link opens in the layout
 * it was copied from; where the two disagree, the address wins.
 *
 * Pure, so the rules are tested without a request.
 */

export const REVENUE_LAYOUT_COOKIE = 'baucrew.revenue-layout'

/** A year, like the sidebar: a preference is not worth asking about twice. */
export const REVENUE_LAYOUT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export const REVENUE_LAYOUTS = ['grid', 'lanes', 'matrix'] as const
export type RevenueLayout = (typeof REVENUE_LAYOUTS)[number]

/**
 * Each layout's zoom: cards to a row in the grid, months on screen in the
 * lanes, and in the matrix how much a cell says — its colour alone, the amount
 * in thousands, or the amount in full.
 */
export const REVENUE_DENSITIES = {
  grid: ['2', '3', '4', '6'],
  lanes: ['3', '6', '12'],
  matrix: ['color', 'short', 'full'],
} as const

export type GridDensity = (typeof REVENUE_DENSITIES.grid)[number]
export type LanesDensity = (typeof REVENUE_DENSITIES.lanes)[number]
export type MatrixDensity = (typeof REVENUE_DENSITIES.matrix)[number]

/** Every layout keeps its own zoom, so switching back finds it as it was left. */
export type RevenueLayoutChoice = {
  layout: RevenueLayout
  grid: GridDensity
  lanes: LanesDensity
  matrix: MatrixDensity
}

/** The grid of three the tab always had. */
export const DEFAULT_REVENUE_LAYOUT: RevenueLayoutChoice = {
  layout: 'grid',
  grid: '3',
  lanes: '6',
  matrix: 'short',
}

/** The value if it is one of the options, the fallback otherwise — never a guess in between. */
function pick<T extends string>(options: readonly T[], value: string | undefined, fallback: T): T {
  return (options as readonly string[]).includes(value ?? '') ? (value as T) : fallback
}

/** "lanes.3.6.short": the layout, then the grid's, the lanes' and the matrix's zoom. */
export function revenueLayoutCookieValue(choice: RevenueLayoutChoice): string {
  return [choice.layout, choice.grid, choice.lanes, choice.matrix].join('.')
}

/** Reads the cookie back; a field it cannot read falls back on its own, and the others stay. */
export function parseRevenueLayoutCookie(value: string | undefined | null): RevenueLayoutChoice {
  const [layout, grid, lanes, matrix] = (value ?? '').split('.')
  return {
    layout: pick(REVENUE_LAYOUTS, layout, DEFAULT_REVENUE_LAYOUT.layout),
    grid: pick(REVENUE_DENSITIES.grid, grid, DEFAULT_REVENUE_LAYOUT.grid),
    lanes: pick(REVENUE_DENSITIES.lanes, lanes, DEFAULT_REVENUE_LAYOUT.lanes),
    matrix: pick(REVENUE_DENSITIES.matrix, matrix, DEFAULT_REVENUE_LAYOUT.matrix),
  }
}

/**
 * The layout the page draws: the saved choice with whatever the address says
 * on top. The zoom is read for the layout the page ends up in — "6" asked of
 * the grid is six cards to a row, asked of the lanes six months on screen —
 * and a value that layout does not offer is ignored.
 */
export function resolveRevenueLayout(
  saved: RevenueLayoutChoice,
  layoutParam?: string,
  perParam?: string
): RevenueLayoutChoice {
  const layout = pick(REVENUE_LAYOUTS, layoutParam, saved.layout)
  return layout === 'grid'
    ? { ...saved, layout, grid: pick(REVENUE_DENSITIES.grid, perParam, saved.grid) }
    : layout === 'lanes'
      ? { ...saved, layout, lanes: pick(REVENUE_DENSITIES.lanes, perParam, saved.lanes) }
      : { ...saved, layout, matrix: pick(REVENUE_DENSITIES.matrix, perParam, saved.matrix) }
}

/** The zoom of the layout that is showing. */
export const revenueDensity = (choice: RevenueLayoutChoice): string => choice[choice.layout]

/** The same choice at another zoom of the layout that is showing. */
export const withDensity = (choice: RevenueLayoutChoice, value: string): RevenueLayoutChoice =>
  resolveRevenueLayout(choice, choice.layout, value)

/**
 * Six to a row, a grid card shows the month's sums and not its site lines: at
 * that width a site's name is a few letters and an ellipsis, and whoever chose
 * so many cards wants to see the year, not read it.
 */
export const revenueCardSummary = (choice: RevenueLayoutChoice): boolean =>
  choice.layout === 'grid' && choice.grid === '6'
