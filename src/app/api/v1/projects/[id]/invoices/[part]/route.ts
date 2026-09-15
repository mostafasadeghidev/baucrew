import { actorOf, readJson, withApi } from '@/lib/api-http'
import { invoiceReadyInput, markInvoiceReady, withdrawInvoice } from '@/lib/api-service'

type Ctx = { params: Promise<{ id: string; part: string }> }

/** Marks invoice 1 (`first`) or 2 (`final`) ready: `{ "number": "…", "amount": 1234.5 }`, both optional. */
export async function PUT(req: Request, ctx: Ctx) {
  const { id, part } = await ctx.params
  return withApi(req, async (identity) =>
    markInvoiceReady(identity.user, id, part, invoiceReadyInput.parse(await readJson(req)), actorOf(identity))
  )
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { id, part } = await ctx.params
  return withApi(req, ({ user }) => withdrawInvoice(user, id, part))
}
