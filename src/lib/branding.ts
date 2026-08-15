import 'server-only'
import { cache } from 'react'
import { db } from './db'

/** Neutral product fallback — shown only until a company name is configured. */
const DEFAULT_APP_NAME = 'BauCrew'

/**
 * Company branding, fully configurable in Settings (nothing hardcoded):
 * `companyName` and the uploaded `logo` both live in AppSetting.
 */
export const getBranding = cache(async () => {
  try {
    const rows = await db.appSetting.findMany({
      where: { key: { in: ['companyName', 'logo'] } },
    })
    const name = rows.find((r) => r.key === 'companyName')?.value.trim()
    return {
      companyName: name || DEFAULT_APP_NAME,
      hasLogo: rows.some((r) => r.key === 'logo'),
    }
  } catch {
    return { companyName: DEFAULT_APP_NAME, hasLogo: false }
  }
})
