import { NextResponse, type NextRequest } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { db } from '@/lib/db'
import { normalizeDate, normalizePrice } from '@/lib/import-excel'

/**
 * The door for automations: an external system (board automation, n8n …)
 * posts a project here and it lands as a DRAFT in the inbox — never as a live
 * project. Secured with a bearer key (INBOUND_API_KEY in the environment).
 */
export async function POST(req: NextRequest) {
  const key = process.env.INBOUND_API_KEY
  if (!key) return NextResponse.json({ error: 'disabled' }, { status: 503 })
  const header = req.headers.get('authorization') ?? ''
  const given = header.startsWith('Bearer ') ? header.slice(7) : ''
  const a = Buffer.from(given)
  const b = Buffer.from(key)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'badJson' }, { status: 400 })
  }
  const text = (v: unknown, max = 300) =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
  const name = text(body.name)
  if (!name) return NextResponse.json({ error: 'nameRequired' }, { status: 400 })

  const externalSystem = text(body.externalSystem, 60)
  const externalId = text(body.externalId, 120)
  const data = {
    source: 'api',
    name,
    customerName: text(body.customerName),
    street: text(body.street),
    postalCode: text(body.postalCode, 20),
    city: text(body.city, 120),
    price: normalizePrice(body.price),
    plannedStart: normalizeDate(body.plannedStart),
    plannedEnd: normalizeDate(body.plannedEnd),
    description: text(body.description, 5000),
    externalSystem,
    externalId,
    externalUrl: text(body.externalUrl, 500),
    payload: JSON.parse(JSON.stringify(body)) as object,
  }

  // The same card sent twice updates its draft instead of duplicating it.
  // Fields the sender left out keep their previous value — a partial update
  // must never wipe what an earlier, fuller payload delivered.
  const update = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null))
  const draft =
    externalSystem && externalId
      ? await db.projectDraft.upsert({
          where: { externalSystem_externalId: { externalSystem, externalId } },
          create: data,
          update,
        })
      : await db.projectDraft.create({ data })

  return NextResponse.json({ ok: true, id: draft.id, status: draft.status })
}
