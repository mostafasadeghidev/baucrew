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
  { id: 'today', hidden: false, width: 'full' },
]

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
