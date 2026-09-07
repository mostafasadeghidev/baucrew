import { withApi } from '@/lib/api-http'
import { canViewFinancials } from '@/lib/authz'

/** Who the key acts as, and what that allows. */
export async function GET(req: Request) {
  return withApi(req, async ({ user, via, keyName }) => ({
    user: { id: user.id, username: user.username, role: user.role },
    financials: canViewFinancials(user),
    via,
    keyName,
  }))
}
