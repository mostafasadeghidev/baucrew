// DB-backed: runs against the dev database (npm run test:db).
// The door for automations — projects found and made by a record of another
// system — and the webhooks that tell them what happened, sent to a real
// local HTTP server.
import 'dotenv/config'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const TAG = `vitest-integrations-${Date.now()}`
const SECRET = 'whsec_vitest'
let userId = ''
let endpointId = ''
let server: Server
let replyStatus = 200
const received: Array<{ headers: Record<string, string | string[] | undefined>; raw: string }> = []

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let user: any

beforeAll(async () => {
  const row = await prisma.user.create({ data: { username: TAG, passwordHash: 'x', role: 'ADMIN' } })
  userId = row.id
  user = { ...row, employee: null }

  server = createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      received.push({ headers: req.headers, raw })
      res.statusCode = replyStatus
      res.end(replyStatus === 200 ? 'ok' : 'nope')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  const endpoint = await prisma.webhookEndpoint.create({
    data: {
      name: TAG,
      url: `http://127.0.0.1:${port}/hook`,
      secret: SECRET,
      events: ['project.created', 'project.status_changed', 'project.updated', 'invoice.ready', 'comment.created'],
    },
  })
  endpointId = endpoint.id
})

afterAll(async () => {
  await prisma.webhookEndpoint.deleteMany({ where: { id: endpointId } })
  await prisma.project.deleteMany({ where: { name: { startsWith: TAG } } })
  await prisma.customer.deleteMany({ where: { name: { startsWith: TAG } } })
  await prisma.auditLog.deleteMany({ where: { userId } })
  await prisma.user.deleteMany({ where: { id: userId } })
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await prisma.$disconnect()
})

beforeEach(() => {
  received.length = 0
  replyStatus = 200
})

describe('a project by its record in another system', () => {
  it('makes a lead from a card, and the same card sent again moves it instead of making a second', async () => {
    const { upsertProjectByLink } = await import('@/lib/api-service')
    const cardId = `${TAG}-card-1`
    const first = await upsertProjectByLink(user, 'Trello', cardId, {
      name: `${TAG} Musterhaus Fassade`,
      customer: { name: `${TAG} Muster GmbH`, email: 'info@muster.example', company: null, contactPerson: null, phone: null, street: null, postalCode: null, city: null },
      url: 'https://trello.com/c/Zz9Yy8Xx/1-musterhaus',
    })
    expect(first.created).toBe(true)
    expect(first.project.status).toBe('LEAD')
    expect(first.project.links).toEqual([{ system: 'trello', externalId: cardId, url: 'https://trello.com/c/Zz9Yy8Xx/1-musterhaus' }])
    expect(first.project.customer.email).toBe('info@muster.example')

    const second = await upsertProjectByLink(user, 'trello', cardId, {
      list: 'Angebot fertig',
      customer: { name: `${TAG} Muster GmbH`, email: 'andere@muster.example', phone: '0911 000', company: null, contactPerson: null, street: null, postalCode: null, city: null },
    })
    expect(second.created).toBe(false)
    expect(second.project.id).toBe(first.project.id)
    expect(second.project.status).toBe('QUOTED')
    // What the office has is kept; what was missing is added.
    expect(second.project.customer.email).toBe('info@muster.example')
    expect(second.project.customer.phone).toBe('0911 000')
    expect(await prisma.projectLink.count({ where: { system: 'trello', externalId: cardId } })).toBe(1)
  })

  it('adopts a project imported before links existed, by the card’s short link', async () => {
    const { upsertProjectByLink } = await import('@/lib/api-service')
    const customer = await prisma.customer.create({ data: { name: `${TAG} Beispiel AG` } })
    const old = await prisma.project.create({
      data: {
        number: `${TAG}-old`,
        name: `${TAG} Beispielweg Innenputz`,
        customerId: customer.id,
        externalSystem: 'trello',
        externalId: '2041-0007',
        externalUrl: 'https://trello.com/c/Qq7Ww6Ee',
      },
    })
    const result = await upsertProjectByLink(user, 'trello', `${TAG}-card-old`, {
      url: 'https://trello.com/c/Qq7Ww6Ee/7-beispielweg',
      plannedStart: '2041-03-02',
    })
    expect(result.created).toBe(false)
    expect(result.project.id).toBe(old.id)
    expect(result.project.plannedStart).toBe('2041-03-02')
  })

  it('refuses to link a record that belongs to another project', async () => {
    const { setProjectLink, upsertProjectByLink } = await import('@/lib/api-service')
    const a = await upsertProjectByLink(user, 'wattro', `${TAG}-w1`, {
      name: `${TAG} Wattro A`,
      customer: { name: `${TAG} Muster GmbH`, company: null, contactPerson: null, phone: null, email: null, street: null, postalCode: null, city: null },
    })
    const b = await upsertProjectByLink(user, 'wattro', `${TAG}-w2`, {
      name: `${TAG} Wattro B`,
      customer: { name: `${TAG} Muster GmbH`, company: null, contactPerson: null, phone: null, email: null, street: null, postalCode: null, city: null },
    })
    await expect(setProjectLink(user, b.project.id, 'wattro', { externalId: `${TAG}-w1` })).rejects.toMatchObject({ status: 409 })
    expect(a.project.id).not.toBe(b.project.id)
  })
})

describe('webhooks', () => {
  it('sends a signed event, retries when the endpoint fails, and tells nothing when nothing changed', async () => {
    const { upsertProjectByLink, updateProject } = await import('@/lib/api-service')
    const { processDueDeliveries } = await import('@/lib/webhooks')
    const { signBody } = await import('@/lib/webhook-events')
    // What the tests above raised goes out first, so what is received below is this test's.
    await processDueDeliveries(100)
    received.length = 0

    const made = await upsertProjectByLink(user, 'trello', `${TAG}-card-hook`, {
      name: `${TAG} Webhook Musterhaus`,
      customer: { name: `${TAG} Muster GmbH`, company: null, contactPerson: null, phone: null, email: null, street: null, postalCode: null, city: null },
    })
    await processDueDeliveries()
    const created = received.map((r) => JSON.parse(r.raw)).find((b) => b.event === 'project.created')
    expect(created?.data.project.id).toBe(made.project.id)
    expect(created?.data.project.links[0].system).toBe('trello')

    received.length = 0
    await updateProject(user, made.project.id, { status: 'APPROVED' })
    await processDueDeliveries()
    const hit = received.find((r) => r.headers['x-baucrew-event'] === 'project.status_changed')
    expect(hit).toBeDefined()
    expect(hit!.headers['x-baucrew-signature']).toBe(signBody(SECRET, hit!.raw))
    expect(JSON.parse(hit!.raw).data).toMatchObject({ from: 'LEAD', to: 'APPROVED', actor: { type: 'api', userId } })

    replyStatus = 500
    await updateProject(user, made.project.id, { name: `${TAG} Webhook Musterhaus neu` })
    const before = Date.now()
    await processDueDeliveries()
    const failed = await prisma.webhookDelivery.findFirst({
      where: { endpointId, event: 'project.updated' },
      orderBy: { createdAt: 'desc' },
    })
    expect(failed).toMatchObject({ status: 'pending', attempts: 1, responseStatus: 500 })
    expect(failed!.lastError).toContain('HTTP 500')
    expect(failed!.nextAttemptAt.getTime()).toBeGreaterThan(before + 50_000)

    const count = await prisma.webhookDelivery.count({ where: { endpointId } })
    await updateProject(user, made.project.id, { name: `${TAG} Webhook Musterhaus neu` })
    expect(await prisma.webhookDelivery.count({ where: { endpointId } })).toBe(count)
  })
})

describe('invoices', () => {
  it('asks half the order value first and the rest at the end, and tells the automation once per invoice', async () => {
    const { markInvoiceReady, upsertProjectByLink, withdrawInvoice } = await import('@/lib/api-service')
    const { processDueDeliveries } = await import('@/lib/webhooks')
    await processDueDeliveries(100)
    received.length = 0

    const made = await upsertProjectByLink(user, 'trello', `${TAG}-card-invoice`, {
      name: `${TAG} Rechnung Musterhaus`,
      price: 10_000,
      customer: { name: `${TAG} Muster GmbH`, company: null, contactPerson: null, phone: null, email: null, street: null, postalCode: null, city: null },
    })
    const first = await markInvoiceReady(user, made.project.number, 'first', { number: 'RE-2041-1' })
    expect(first.invoices).toEqual([expect.objectContaining({ part: 1, kind: 'first', number: 'RE-2041-1', amount: 5000 })])
    await processDueDeliveries()
    const told = received.map((r) => JSON.parse(r.raw)).filter((b) => b.event === 'invoice.ready')
    expect(told).toHaveLength(1)
    expect(told[0].data).toMatchObject({
      invoice: { part: 1, kind: 'first', number: 'RE-2041-1', amount: 5000 },
      project: { id: made.project.id, invoices: [{ part: 1 }] },
      actor: { type: 'api', userId },
    })

    // Marked again: the number changes, nobody is told twice.
    received.length = 0
    await markInvoiceReady(user, made.project.id, 1, { number: 'RE-2041-1a' })
    await processDueDeliveries()
    expect(received.filter((r) => r.headers['x-baucrew-event'] === 'invoice.ready')).toHaveLength(0)

    // A follow-on offer accepted in between lands on the final invoice.
    await prisma.projectAddOn.create({ data: { projectId: made.project.id, label: 'Nachtrag', amount: 1_000, date: new Date() } })
    const final = await markInvoiceReady(user, made.project.id, 'final', {})
    expect(final.invoices).toEqual([
      expect.objectContaining({ part: 1, number: 'RE-2041-1a', amount: 5000 }),
      expect.objectContaining({ part: 2, kind: 'final', amount: 6000 }),
    ])

    const back = await withdrawInvoice(user, made.project.id, 2)
    expect(back.invoices?.map((i) => i.part)).toEqual([1])
    await expect(markInvoiceReady(user, made.project.id, 3, {})).rejects.toMatchObject({ status: 400 })
  })
})

describe('comments', () => {
  it('names the people written with @ and tells the automation', async () => {
    const { addComment, listComments, upsertProjectByLink } = await import('@/lib/api-service')
    const { processDueDeliveries } = await import('@/lib/webhooks')
    await processDueDeliveries(100)
    received.length = 0

    const made = await upsertProjectByLink(user, 'trello', `${TAG}-card-comment`, {
      name: `${TAG} Kommentar Musterhaus`,
      customer: { name: `${TAG} Muster GmbH`, company: null, contactPerson: null, phone: null, email: null, street: null, postalCode: null, city: null },
    })
    const written = await addComment(user, made.project.number, { body: `Bitte @${TAG} anrufen, @niemand nicht.`, office: false })
    expect(written).toMatchObject({ office: false, mentions: [userId], author: { id: userId, username: TAG } })
    expect((await listComments(user, made.project.id)).map((c) => c.id)).toEqual([written!.id])

    await processDueDeliveries()
    const told = received.map((r) => JSON.parse(r.raw)).filter((b) => b.event === 'comment.created')
    expect(told).toHaveLength(1)
    expect(told[0].data).toMatchObject({
      comment: { id: written!.id, mentions: [{ id: userId, username: TAG }] },
      project: { id: made.project.id },
      actor: { type: 'api', userId },
    })
    await expect(addComment(user, made.project.id, { body: '   ', office: false })).rejects.toBeDefined()
  })
})
