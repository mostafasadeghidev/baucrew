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

/**
 * Where the list/board switch leads. It keeps what both views understand — the
 * search, the year and which board — and drops what only the list has, the
 * status tab and the page number, which would otherwise turn the board back
 * into the list.
 */
export function projectsViewHref(target: 'list' | 'board', keep: { q?: string; year?: string; board?: string }): string {
  const params = new URLSearchParams()
  if (target === 'list') params.set('view', 'list')
  if (keep.q) params.set('q', keep.q)
  if (keep.year) params.set('year', keep.year)
  if (keep.board) params.set('board', keep.board)
  const query = params.toString()
  return query ? `/projects?${query}` : '/projects'
}
