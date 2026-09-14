import { actorOf, readJson, withApi } from '@/lib/api-http'
import { getProject, updateProject, updateProjectInput } from '@/lib/api-service'

type Ctx = { params: Promise<{ id: string }> }

/** One project by id or number. */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withApi(req, ({ user }) => getProject(user, id))
}

/** Changes what is sent: status, name, dates, price, manager, description, address. */
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withApi(req, async (identity) =>
    updateProject(identity.user, id, updateProjectInput.parse(await readJson(req)), actorOf(identity))
  )
}
