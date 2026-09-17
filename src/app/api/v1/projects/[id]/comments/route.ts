import { actorOf, readJson, withApi } from '@/lib/api-http'
import { addComment, commentInput, listComments } from '@/lib/api-service'

type Ctx = { params: Promise<{ id: string }> }

/** The comments on a project, oldest first. */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withApi(req, ({ user }) => listComments(user, id))
}

/** A comment from an automation — "Angebot versendet", say: `{ "body": "…", "office": false }`. */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withApi(req, async (identity) => addComment(identity.user, id, commentInput.parse(await readJson(req)), actorOf(identity)))
}
