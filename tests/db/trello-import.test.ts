// DB-backed: runs against the dev database (npm run test:db).
// The Trello import run again: a project an earlier import left with the job
// number alone is linked to its card and not doubled, a second card of the
// same number gets a project of its own, a project somebody made by hand is
// never taken for a card, and the same board twice creates nothing.
import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { parseTrelloExport } from '@/lib/trello'

const who = vi.hoisted(() => ({ user: null as unknown }))
vi.mock('@/lib/auth', () => ({ getCurrentUser: async () => who.user }))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`)
  },
}))
vi.mock('@/lib/geocode', () => ({ geocodeCity: async () => null }))

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const TAG = `vitest-trello-${Date.now()}`
const NUMBER = `9${String(Date.now()).slice(-7)}`
const LIST = 'a'.repeat(23) + '1'
const CARD = (n: number) => 'b'.repeat(23) + String(n)
let userId = ''
let customerId = ''
let legacyId = ''
let ownId = ''

const board = parseTrelloExport({
  id: 'c'.repeat(24),
  name: `${TAG} Board`,
  lists: [{ id: LIST, name: 'Aufträge', pos: 1 }],
  cards: [
    // The job an earlier import left with its number only.
    { id: CARD(1), name: `${TAG} Muster Fassade (${NUMBER})`, idList: LIST, closed: false, pos: 1 },
    // A second card of the same number, archived: an offer put away and the job made anew.
    { id: CARD(2), name: `${TAG} Muster Fassade (${NUMBER})`, idList: LIST, closed: true, dateClosed: '2026-01-02T10:00:00.000Z', pos: 2 },
    // A card whose title is exactly the name of a project the office made by hand.
    { id: CARD(3), name: `${TAG} Eigenes`, idList: LIST, closed: false, pos: 3 },
  ],
})!

const run = async () => {
  const { importTrello } = await import('@/app/(admin)/settings/import-trello/actions')
  const form = new FormData()
  form.set(`list_${LIST}`, 'APPROVED')
  form.set('includeArchived', 'on')
  form.set('includeFields', 'on')
  return importTrello({ step: 'preview', board, suggested: {} }, form)
}

const projects = () =>
  prisma.project.findMany({
    where: { name: { startsWith: TAG } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, externalSystem: true, externalId: true, jobNumber: true, archivedAt: true, links: { select: { externalId: true } } },
  })

beforeAll(async () => {
  const user = await prisma.user.create({ data: { username: TAG, passwordHash: 'x', role: 'ADMIN' } })
  userId = user.id
  who.user = { ...user, employee: null }
  customerId = (await prisma.customer.create({ data: { name: `${TAG} Muster` } })).id
  legacyId = (
    await prisma.project.create({
      data: { number: `${TAG}-legacy`, name: `${TAG} Muster Fassade`, customerId, status: 'PLANNED', externalSystem: 'trello', externalId: NUMBER },
    })
  ).id
  ownId = (await prisma.project.create({ data: { number: `${TAG}-own`, name: `${TAG} Eigenes`, customerId, status: 'LEAD' } })).id
})

afterAll(async () => {
  await prisma.project.deleteMany({ where: { name: { startsWith: TAG } } })
  await prisma.customer.deleteMany({ where: { name: { startsWith: TAG } } })
  await prisma.auditLog.deleteMany({ where: { userId } })
  await prisma.user.delete({ where: { id: userId } })
  await prisma.$disconnect()
})

describe('the Trello import, run again', () => {
  it('links the job known by number alone, gives the second card of that number a project of its own, and leaves a hand-made project alone', async () => {
    const result = await run()
    expect(result.step).toBe('done')
    if (result.step !== 'done') return
    expect({ created: result.created, updated: result.updated }).toEqual({ created: 2, updated: 1 })

    const rows = await projects()
    expect(rows).toHaveLength(4)
    const legacy = rows.find((p) => p.id === legacyId)!
    expect(legacy.links.map((l) => l.externalId)).toEqual([CARD(1)])
    const own = rows.find((p) => p.id === ownId)!
    expect(own).toMatchObject({ externalSystem: null, externalId: null, links: [] })
    const second = rows.find((p) => p.links.some((l) => l.externalId === CARD(2)))!
    expect(second).toMatchObject({ externalId: NUMBER })
    expect(second.archivedAt).not.toBeNull()
    expect(second.id).not.toBe(legacyId)
    // The title's number becomes the Projektnummer of the project that had none; the
    // second card of that number does not take it twice — the number is unique.
    expect(legacy.jobNumber).toBe(NUMBER)
    expect(second.jobNumber).toBeNull()
  })

  it('never overwrites a Projektnummer somebody corrected in the app', async () => {
    await prisma.project.update({ where: { id: legacyId }, data: { jobNumber: `${NUMBER}-neu` } })
    const result = await run()
    expect(result.step).toBe('done')
    expect((await prisma.project.findUnique({ where: { id: legacyId }, select: { jobNumber: true } }))!.jobNumber).toBe(`${NUMBER}-neu`)
    // The number the correction freed is free for the other card's project, as it should be.
    const other = (await projects()).find((p) => p.links.some((l) => l.externalId === CARD(2)))!
    expect(other.jobNumber).toBe(NUMBER)
  })

  it('creates nothing the second time and keeps every link where it was', async () => {
    const before = await projects()
    const result = await run()
    expect(result.step).toBe('done')
    if (result.step !== 'done') return
    expect({ created: result.created, updated: result.updated, customers: result.customersCreated }).toEqual({ created: 0, updated: 3, customers: 0 })
    const after = await projects()
    expect(after.map((p) => [p.id, p.links])).toEqual(before.map((p) => [p.id, p.links]))
  })
})
