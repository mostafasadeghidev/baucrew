import 'server-only'
import { cache } from 'react'
import { db } from './db'

/** Neutral product fallback — shown only until a company name is configured. */
const DEFAULT_APP_NAME = 'BauCrew'
/** Default accent — matches the CSS token in globals.css. */
export const DEFAULT_ACCENT = '#1d4ed8'

/** #rrggbb only; anything else falls back to the default. */
export function normalizeAccent(value: string | undefined | null): string {
  const v = (value ?? '').trim().toLowerCase()
  return /^#[0-9a-f]{6}$/.test(v) ? v : DEFAULT_ACCENT
}

/** Slightly darker/lighter variant used for hover states. */
export function shiftColor(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const clamp = (x: number) => Math.max(0, Math.min(255, x))
  const r = clamp(((n >> 16) & 255) + amount)
  const g = clamp(((n >> 8) & 255) + amount)
  const b = clamp((n & 255) + amount)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/**
 * Company branding, fully configurable in Settings (nothing hardcoded):
 * `companyName` and the uploaded `logo` both live in AppSetting.
 */
export const getBranding = cache(async () => {
  try {
    const rows = await db.appSetting.findMany({
      where: { key: { in: ['companyName', 'logo', 'accentColor'] } },
    })
    const name = rows.find((r) => r.key === 'companyName')?.value.trim()
    return {
      companyName: name || DEFAULT_APP_NAME,
      hasLogo: rows.some((r) => r.key === 'logo'),
      accentColor: normalizeAccent(rows.find((r) => r.key === 'accentColor')?.value),
    }
  } catch {
    return { companyName: DEFAULT_APP_NAME, hasLogo: false, accentColor: DEFAULT_ACCENT }
  }
})
