/**
 * Personal dashboard layout: which widgets are shown, in which order and how
 * wide. Stored per user as JSON in `User.dashboardLayout`. Pure — the DB call
 * lives in the dashboard page / action.
 */

export const DASHBOARD_WIDGETS = [
  'stats',
  'conflicts',
  'weather',
  'packing',
  'attention',
  'today',
  'tomorrow',
  'week',
  'checklists',
  'offers',
  'revenueMonth',
  'dueThisWeek',
  'stock',
] as const

export type DashboardWidget = (typeof DASHBOARD_WIDGETS)[number]

export type WidgetLayout = {
  id: DashboardWidget
  hidden: boolean
  /** 'full' spans the whole row, 'half' shares the row on wide screens. */
  width: 'full' | 'half'
}

/** What a user sees before they ever touch the edit mode. */
export const DEFAULT_LAYOUT: WidgetLayout[] = [
  { id: 'stats', hidden: false, width: 'full' },
  { id: 'conflicts', hidden: false, width: 'half' },
  { id: 'weather', hidden: false, width: 'half' },
  { id: 'packing', hidden: false, width: 'half' },
  { id: 'attention', hidden: false, width: 'half' },
  { id: 'today', hidden: false, width: 'half' },
  { id: 'tomorrow', hidden: false, width: 'half' },
  { id: 'week', hidden: false, width: 'full' },
  { id: 'checklists', hidden: false, width: 'half' },
  { id: 'dueThisWeek', hidden: false, width: 'half' },
  { id: 'offers', hidden: false, width: 'half' },
  { id: 'revenueMonth', hidden: false, width: 'half' },
  { id: 'stock', hidden: false, width: 'half' },
]

/** Cards that show money — hidden from accounts without financial access. */
export const FINANCIAL_WIDGETS: readonly DashboardWidget[] = ['offers', 'revenueMonth']

/** Drops the money cards for users who may not see prices. */
export function allowedLayout(layout: WidgetLayout[], canSeeMoney: boolean): WidgetLayout[] {
  return canSeeMoney ? layout : layout.filter((w) => !FINANCIAL_WIDGETS.includes(w.id))
}

function isWidget(v: unknown): v is DashboardWidget {
  return typeof v === 'string' && (DASHBOARD_WIDGETS as readonly string[]).includes(v)
}

/**
 * Parses the stored JSON. Unknown entries are dropped and widgets added in a
 * later release are appended with their default, so nobody loses a new card.
 */
export function parseLayout(raw: string | null | undefined): WidgetLayout[] {
  let stored: WidgetLayout[] = []
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        stored = parsed
          .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
          .filter((v) => isWidget(v.id))
          .map((v) => ({
            id: v.id as DashboardWidget,
            hidden: v.hidden === true,
            width: v.width === 'half' ? 'half' : 'full',
          }))
      }
    } catch {
      stored = []
    }
  }
  if (stored.length === 0) return DEFAULT_LAYOUT.map((w) => ({ ...w }))
  const seen = new Set(stored.map((w) => w.id))
  return [...stored, ...DEFAULT_LAYOUT.filter((w) => !seen.has(w.id)).map((w) => ({ ...w }))]
}

export function serializeLayout(layout: WidgetLayout[]): string {
  return JSON.stringify(layout)
}

/** Moves one widget up or down; returns a new array. */
export function moveWidget(layout: WidgetLayout[], id: DashboardWidget, direction: -1 | 1): WidgetLayout[] {
  const index = layout.findIndex((w) => w.id === id)
  const target = index + direction
  if (index === -1 || target < 0 || target >= layout.length) return layout
  const next = [...layout]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

export function toggleHidden(layout: WidgetLayout[], id: DashboardWidget): WidgetLayout[] {
  return layout.map((w) => (w.id === id ? { ...w, hidden: !w.hidden } : w))
}

export function toggleWidth(layout: WidgetLayout[], id: DashboardWidget): WidgetLayout[] {
  return layout.map((w) => (w.id === id ? { ...w, width: w.width === 'full' ? 'half' : 'full' } : w))
}

/**
 * Applies an order coming from drag & drop: known ids first in the given
 * order, anything the client did not send (e.g. a card it never saw) keeps its
 * relative place at the end. Hidden state and width are preserved.
 */
export function reorderLayout(layout: WidgetLayout[], orderedIds: string[]): WidgetLayout[] {
  const byId = new Map(layout.map((w) => [w.id, w]))
  const next: WidgetLayout[] = []
  for (const id of orderedIds) {
    const widget = byId.get(id as DashboardWidget)
    if (widget && !next.includes(widget)) next.push(widget)
  }
  for (const widget of layout) if (!next.includes(widget)) next.push(widget)
  return next
}
