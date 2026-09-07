import { withApi } from '@/lib/api-http'
import { listVehicles } from '@/lib/api-service'

export async function GET(req: Request) {
  return withApi(req, ({ user }) => listVehicles(user))
}
