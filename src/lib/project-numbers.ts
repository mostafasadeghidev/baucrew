import 'server-only'
import { db } from './db'

/**
 * The next project number: the year, a dash, and a count that starts at
 * 0001 each year — "2026-0048". Two projects created in the same moment
 * may draw the same number; the caller retries once on the unique clash.
 */
export async function nextProjectNumber(): Promise<string> {
  const year = new Date().getUTCFullYear()
  const prefix = `${year}-`
  const last = await db.project.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
    select: { number: true },
  })
  const lastSeq = last ? Number(last.number.slice(prefix.length)) : 0
  return `${prefix}${String(lastSeq + 1).padStart(4, '0')}`
}

/** Whether a database error is the unique-key clash a retry is meant for. */
export const isUniqueClash = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'P2002'
