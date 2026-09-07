import { readJson, withApi } from '@/lib/api-http'
import { getProject, projectStatusInput, setProjectStatus } from '@/lib/api-service'

type Ctx = { params: Promise<{ id: string }> }

/** One project by id or number. */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withApi(req, ({ user }) => getProject(user, id))
}

/** For now the one thing to change from outside: the status. */
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withApi(req, async ({ user }) => {
    const { status } = projectStatusInput.parse(await readJson(req))
    return setProjectStatus(user, id, status)
  })
}
