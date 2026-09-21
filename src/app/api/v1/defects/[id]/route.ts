import { actorOf, readJson, withApi } from '@/lib/api-http'
import { defectPatchInput, patchDefect } from '@/lib/api-service'

type Ctx = { params: Promise<{ id: string }> }

/** Put a defect right, or open it again: `{ "resolved": true }`. */
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withApi(req, async (identity) => patchDefect(identity.user, id, defectPatchInput.parse(await readJson(req)), actorOf(identity)))
}
