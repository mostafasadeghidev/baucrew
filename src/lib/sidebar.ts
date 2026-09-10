/**
 * Whether the sidebar stands open or folded to a rail of icons.
 *
 * The choice lives in a cookie rather than in the browser's storage so the
 * server already knows it while it renders: read from storage, the page would
 * arrive wide and the sidebar would snap shut a moment later, in front of the
 * reader.
 */

export const SIDEBAR_COOKIE = 'baucrew.sidebar'

/** A year: a preference like this is not worth asking about twice. */
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export const sidebarCookieValue = (collapsed: boolean) => (collapsed ? 'rail' : 'wide')

/** Anything but the rail value — including nothing at all — means open. */
export const isSidebarCollapsed = (value: string | undefined | null) => value === 'rail'
