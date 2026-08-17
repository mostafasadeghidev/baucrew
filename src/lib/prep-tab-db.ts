import { db } from './db'
import { PREP_TAB_KEY, parsePrepTabConfig, type PrepTabConfig } from './prep-tab'

export async function getPrepTabConfig(): Promise<PrepTabConfig> {
  try {
    const row = await db.appSetting.findUnique({ where: { key: PREP_TAB_KEY } })
    return parsePrepTabConfig(row?.value)
  } catch {
    return parsePrepTabConfig(null)
  }
}
