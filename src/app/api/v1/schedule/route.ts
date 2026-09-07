import { query, readJson, withApi } from '@/lib/api-http'
import { listSchedule, listScheduleInput, planEntry, planEntryInput } from '@/lib/api-service'

/** Entries between two days (inclusive): ?from=YYYY-MM-DD&to=YYYY-MM-DD[&projectId=…] */
export async function GET(req: Request) {
  return withApi(req, ({ user }) => listSchedule(user, listScheduleInput.parse(query(req))))
}

/** Puts a project on the board for a day or a range of days. */
export async function POST(req: Request) {
  return withApi(req, async ({ user }) => planEntry(user, planEntryInput.parse(await readJson(req))))
}
