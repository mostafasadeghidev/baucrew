/**
 * Whether the projects page opens as the board or as the list.
 *
 * The board is where the page opens. The list is asked for by name
 * (`view=list`) — or by what only the list understands: a status tab or a
 * page number. That is how the dashboard's "in progress" and "planned" links,
 * and every link the list makes to itself, still land on the list. An old
 * `view=kanban` bookmark still opens the board.
 *
 * Pure, so the rule is tested without a request.
 */
export function opensBoard(params: { view?: string; status?: string; page?: string }): boolean {
  if (params.view === 'list') return false
  if (params.view === 'kanban') return true
  return !params.status && !params.page
}

/** What the switch between list and board takes along. */
export type ProjectsViewKeep = {
  q?: string
  year?: string
  board?: string
  /** A status tab of the list — a status, or "prep". */
  status?: string
  member?: string
  label?: string
  urgent?: string
}

/**
 * Where the list/board switch leads. Both views answer to the same filters, so
 * all of them go along: the search, the year, which board, who, which trade,
 * urgent only — and the status tab. A status alone would open the list (see
 * above), so the board is asked for by name when one goes with it; the page
 * number is the one thing left behind, it counts rows only the list has.
 */
export function projectsViewHref(target: 'list' | 'board', keep: ProjectsViewKeep): string {
  const params = new URLSearchParams()
  if (target === 'list') params.set('view', 'list')
  else if (keep.status) params.set('view', 'kanban')
  if (keep.q) params.set('q', keep.q)
  if (keep.status) params.set('status', keep.status)
  if (keep.year) params.set('year', keep.year)
  if (keep.board) params.set('board', keep.board)
  if (keep.member) params.set('member', keep.member)
  if (keep.label) params.set('label', keep.label)
  if (keep.urgent) params.set('urgent', keep.urgent)
  const query = params.toString()
  return query ? `/projects?${query}` : '/projects'
}

/**
 * The columns a status tab leaves standing on a board: the ones whose status
 * the tab holds, in the board's own order. Null when the tab asks for nothing
 * — or for nothing this board has a column for: a board narrowed to no column
 * at all would be an empty page with no way to tell why, so such a board is
 * shown whole.
 */
export function narrowedStatuses(boardStatuses: string[], wanted: string[] | null): string[] | null {
  if (!wanted) return null
  const kept = boardStatuses.filter((status) => wanted.includes(status))
  return kept.length > 0 ? kept : null
}
