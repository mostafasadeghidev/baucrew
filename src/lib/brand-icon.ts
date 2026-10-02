/**
 * The icon in the browser's tab — and on a phone's home screen — is the
 * company's own: an image uploaded in Settings next to the logo, or, until
 * there is one, the first letter of the company's name on the company's
 * colour. A logo is usually wide, and a wide logo at sixteen pixels is a
 * smudge, so the two are uploaded separately. Nothing of it is a file in the
 * repository: like the logo it lives in the settings.
 *
 * Pure: the route that serves the icon and the settings that take it in both
 * lean on this, and it is tested on its own.
 */

/** What an uploaded icon may be: a PNG, an .ico or an SVG — what every browser takes for a tab. */
export const FAVICON_TYPES = ['image/png', 'image/x-icon', 'image/svg+xml'] as const
export type FaviconType = (typeof FAVICON_TYPES)[number]

/** An icon is small; anything near this size is a photo uploaded by mistake. */
export const FAVICON_MAX_BYTES = 256 * 1024

/**
 * What an uploaded file really is, read from its first bytes rather than taken
 * from its name or the type the browser guessed — Windows hands an .ico over
 * with no type at all, and a file named .png need not be one. Null for
 * anything that is none of the three.
 */
export function faviconType(bytes: Uint8Array): FaviconType | null {
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return 'image/png'
  if (bytes.length >= 4 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) return 'image/x-icon'
  // An SVG is text: an optional byte-order mark, an XML declaration or a
  // comment, and then the <svg> element itself near the top.
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, 1024)).replace(/^﻿/, '').trimStart()
  if (head.startsWith('<') && /<svg[\s>]/i.test(head)) return 'image/svg+xml'
  return null
}

/**
 * The letter on the generated icon: the first letter or digit of the company's
 * name, as a capital — "Ü" for an umlaut, never a space, a dot or an "&".
 */
export function iconInitial(companyName: string): string {
  const first = companyName.match(/[\p{L}\p{N}]/u)?.[0]
  return first ? first.toLocaleUpperCase('de-DE') : 'B'
}

/** White on a dark colour, near-black on a light one — the letter must read on whatever colour was chosen. */
export function iconInk(accent: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(accent)) return '#ffffff'
  const n = parseInt(accent.slice(1), 16)
  const channel = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  // Where white and this near-black are equally readable (WCAG contrast).
  return luminance > 0.2 ? '#111827' : '#ffffff'
}

/**
 * A short mark that changes whenever the icon would: browsers keep a tab icon
 * for a long time, so its address carries this and a new icon is a new
 * address. FNV-1a over what the icon is made of — the uploaded image, or the
 * name and colour the generated one is drawn from.
 */
export function iconVersion(...parts: string[]): string {
  let hash = 0x811c9dc5
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      hash ^= part.charCodeAt(i)
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
    hash ^= 0x1f
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(36)
}
