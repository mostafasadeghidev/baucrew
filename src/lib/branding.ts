import 'server-only'
import { cache } from 'react'
import { db } from './db'
import { iconVersion } from './brand-icon'

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
 * `companyName`, the uploaded `logo` and the tab's `favicon` all live in
 * AppSetting. `iconVersion` changes with whatever the tab's icon is drawn
 * from (src/lib/brand-icon.ts), so a browser never keeps showing the old one.
 */
export const getBranding = cache(async () => {
  try {
    const rows = await db.appSetting.findMany({
      where: { key: { in: ['companyName', 'logo', 'accentColor', 'favicon'] } },
    })
    const name = rows.find((r) => r.key === 'companyName')?.value.trim()
    const companyName = name || DEFAULT_APP_NAME
    const accentColor = normalizeAccent(rows.find((r) => r.key === 'accentColor')?.value)
    const favicon = rows.find((r) => r.key === 'favicon')?.value
    return {
      companyName,
      hasLogo: rows.some((r) => r.key === 'logo'),
      accentColor,
      hasFavicon: favicon !== undefined,
      iconVersion: favicon !== undefined ? iconVersion(favicon) : iconVersion(companyName, accentColor),
    }
  } catch {
    return {
      companyName: DEFAULT_APP_NAME,
      hasLogo: false,
      accentColor: DEFAULT_ACCENT,
      hasFavicon: false,
      iconVersion: iconVersion(DEFAULT_APP_NAME, DEFAULT_ACCENT),
    }
  }
})
