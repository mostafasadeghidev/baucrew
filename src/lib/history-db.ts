import 'server-only'
import { cache } from 'react'
import { db } from './db'
import { parseHistoryCutoff } from './history'

export const HISTORY_CUTOFF_KEY = 'historyCutoff'

/**
 * The day the office named as the end of the old data, or null when it has
 * named none. Cached per request — several reports ask for it.
 */
export const getHistoryCutoff = cache(async (): Promise<Date | null> => {
  try {
    const row = await db.appSetting.findUnique({ where: { key: HISTORY_CUTOFF_KEY } })
    return parseHistoryCutoff(row?.value)
  } catch {
    return null
  }
})
