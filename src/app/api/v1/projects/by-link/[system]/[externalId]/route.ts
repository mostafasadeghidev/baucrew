import { actorOf, readJson, withApi } from '@/lib/api-http'
import { getProjectByLink, upsertProjectByLink, upsertProjectByLinkInput } from '@/lib/api-service'

type Ctx = { params: Promise<{ system: string; externalId: string }> }

/** The id as sent, whether the router handed it over decoded or not. */
const idOf = (raw: string) => {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/** The project linked to a record of another system — a Trello card, a Wattro project. */
export async function GET(req: Request, ctx: Ctx) {
  const { system, externalId } = await ctx.params
  return withApi(req, ({ user }) => getProjectByLink(user, system, idOf(externalId)))
}

/** Updates the project linked to the record, or makes one and links it. Answers `{ created, project }`. */
export async function PUT(req: Request, ctx: Ctx) {
  const { system, externalId } = await ctx.params
  return withApi(req, async (identity) =>
    upsertProjectByLink(
      identity.user,
      system,
      idOf(externalId),
      upsertProjectByLinkInput.parse(await readJson(req)),
      actorOf(identity)
    )
  )
}
