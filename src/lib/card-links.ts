/**
 * Links attached to a card, the way Trello attaches one beside the files: an
 * address as it was pasted — "www.example.test/plan" is read as https — and
 * the words it is shown with, or else its site and path.
 *
 * Pure, so what is taken and how it reads are tested without a browser.
 */

/** The longest address kept; anything longer is not a link someone pasted. */
export const MAX_LINK = 2000

/** An http(s) address from what was typed or pasted, or null when it is none. */
export function normalizeLink(raw: string): string | null {
  const text = raw.trim()
  if (!text || text.length > MAX_LINK || /\s/.test(text)) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  // A bare word is not a site: at least one dot, or a local name with a port.
  if (!url.hostname.includes('.') && !url.port && url.hostname !== 'localhost') return null
  return url.toString()
}

/** What a link is shown as: its own words, else the site and the path without the protocol. */
export function linkLabel(url: string, title: string | null): string {
  if (title && title.trim()) return title.trim()
  try {
    const u = new URL(url)
    const path = `${u.pathname}${u.search}`.replace(/\/$/, '')
    return `${u.hostname.replace(/^www\./, '')}${path}`
  } catch {
    return url
  }
}

/** The site a link leads to, for the line under its name. */
export function linkSite(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/**
 * A file's new name as typed: the ending it had is kept when the new name
 * leaves it off, so the file still opens as what it is.
 */
export function renamedFile(current: string, typed: string): string | null {
  const name = typed.replace(/[\\/\u0000-\u001f]/g, '').trim().slice(0, 200)
  if (!name) return null
  const ending = /\.[a-z0-9]{1,5}$/i.exec(current)?.[0] ?? ''
  if (ending && !name.toLowerCase().endsWith(ending.toLowerCase()) && !/\.[a-z0-9]{1,5}$/i.test(name)) return `${name}${ending}`
  return name
}
