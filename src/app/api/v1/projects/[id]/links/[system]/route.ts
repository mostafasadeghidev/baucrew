import { readJson, withApi } from '@/lib/api-http'
import { projectLinkInput, removeProjectLink, setProjectLink } from '@/lib/api-service'

type Ctx = { params: Promise<{ id: string; system: string }> }

/** Links the project to its record in the system: `{ "externalId": "…", "url": "…" }`. */
export async function PUT(req: Request, ctx: Ctx) {
  const { id, system } = await ctx.params
  return withApi(req, async ({ user }) => setProjectLink(user, id, system, projectLinkInput.parse(await readJson(req))))
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { id, system } = await ctx.params
  return withApi(req, ({ user }) => removeProjectLink(user, id, system))
}
