/**
 * The addresses a card opened over the board lives at.
 *
 * The card is a route of its own, `/projects/card/<id>`, so opening it needs
 * no re-render of the board underneath (the sheet streams in over the board,
 * the way a Trello card opens). The board's own context — which board, the
 * search, the year, the filters, the view — rides along as search params, so
 * a save can return to the very board the card was opened from, the sheet
 * still open. Pure, so the rules are tested without a request.
 */

/** The params that belong to a sheet, not to the board underneath it. */
const SHEET_PARAMS = ['card', 'template']

/** The route of a card opened over the board. */
export function cardPath(id: string): string {
  return `/projects/card/${id}`
}

/** Whether this address is a card opened over the board (not the project's full page). */
export function isCardPath(pathname: string): boolean {
  return /^\/projects\/card\/[^/]+/.test(pathname)
}

/**
 * The card's address over this very board: the board context as it stands,
 * the sheet's own params left out. `pop` rides along so a quick editor can
 * open the card with one of its small windows already open.
 */
export function cardHref(context: URLSearchParams, id: string, pop?: string): string {
  const params = new URLSearchParams(context)
  for (const key of SHEET_PARAMS) params.delete(key)
  if (pop) params.set('pop', pop)
  const qs = params.toString()
  return `${cardPath(id)}${qs ? `?${qs}` : ''}`
}

/**
 * Where a save from the sheet returns to: the board's address with the card
 * still open (`?card=<id>`, the form the board page itself answers), so the
 * board comes back fresh and the sheet stays where it was. The card route's
 * own `pop` is answered once by the window it opens; a round through the
 * server must not open it twice.
 */
export function cardReturnTo(context: URLSearchParams, id: string): string {
  const params = new URLSearchParams(context)
  for (const key of SHEET_PARAMS) params.delete(key)
  params.delete('pop')
  params.set('card', id)
  return `/projects?${params.toString()}`
}
