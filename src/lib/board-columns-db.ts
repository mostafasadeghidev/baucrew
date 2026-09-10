import { db } from './db'
import { PROJECT_BOARD_KEY, parseBoardConfig, type BoardConfig } from './board-columns'

export async function getBoardConfig(): Promise<BoardConfig> {
  try {
    const row = await db.appSetting.findUnique({ where: { key: PROJECT_BOARD_KEY } })
    return parseBoardConfig(row?.value)
  } catch {
    return parseBoardConfig(null)
  }
}
