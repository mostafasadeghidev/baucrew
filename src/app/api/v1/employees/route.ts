import { withApi } from '@/lib/api-http'
import { listEmployees } from '@/lib/api-service'

export async function GET(req: Request) {
  return withApi(req, ({ user }) => listEmployees(user))
}
