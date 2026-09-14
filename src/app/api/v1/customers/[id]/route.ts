import { readJson, withApi } from '@/lib/api-http'
import { getCustomer, updateCustomer, updateCustomerInput } from '@/lib/api-service'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withApi(req, ({ user }) => getCustomer(user, id))
}

/** Changes what is sent; null clears a field. */
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withApi(req, async ({ user }) => updateCustomer(user, id, updateCustomerInput.parse(await readJson(req))))
}
