import { actorOf, readJson, withApi } from '@/lib/api-http'
import { addDefect, defectInput, listDefects } from '@/lib/api-service'

type Ctx = { params: Promise<{ id: string }> }

/** The defects of a project, the open ones first. */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withApi(req, ({ user }) => listDefects(user, id))
}

/** A defect from an automation: `{ "title": "…", "location": "…", "description": "…", "dueDate": "2026-10-01", "assigneeId": "…" }`. */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withApi(req, async (identity) => addDefect(identity.user, id, defectInput.parse(await readJson(req)), actorOf(identity)))
}
