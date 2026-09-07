import { query, withApi } from '@/lib/api-http'
import { revenueByMonth, yearInput } from '@/lib/api-service'

/** The month-by-month turnover of a year: ?year=2026 */
export async function GET(req: Request) {
  return withApi(req, ({ user }) => revenueByMonth(user, yearInput.parse(query(req).year ?? new Date().getUTCFullYear())))
}
