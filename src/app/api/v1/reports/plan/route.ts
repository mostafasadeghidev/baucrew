import { query, withApi } from '@/lib/api-http'
import { planGapsReport, yearInput } from '@/lib/api-service'

/** Lines of the year plan without a project: ?year=2026 */
export async function GET(req: Request) {
  return withApi(req, ({ user }) => planGapsReport(user, yearInput.parse(query(req).year ?? new Date().getUTCFullYear())))
}
