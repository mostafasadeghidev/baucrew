// DB-backed: runs against the database in DATABASE_URL (npm run test:db) —
// a throwaway one, never real data. The Trello field "Art der Arbeit" in the
// project: the trades it names as the project's trades, the words no trade
// says as its work note — filled while the note is empty, never over what the
// office typed — and both in the project's name.
import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { compressToUTF16 } from 'lz-string'
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

const TAG = `vitest-worknote-${Date.now()}`
// A trade of this run's own, letters only: the matcher reads letters.
const TRADE = `Zwerk${Date.now().toString(26).replace(/\d/g, (d) => 'qrstuvwxyz'[Number(d)])}`
const LIST = 'd'.repeat(23) + '1'
const CARD = 'e'.repeat(23) + '1'
let userId = ''
let tradeId = ''

const packed = (key: string, data: unknown) => JSON.stringify({ [key]: compressToUTF16(JSON.stringify(data)) })
const board = parseTrelloExport({
  id: 'f'.repeat(24),
  name: `${TAG} Board`,
  lists: [{ id: LIST, name: 'Aufträge', pos: 1 }],
  pluginData: [
    {
      idPlugin: 'p1',
      value: packed('CFG', {
        version: 1,
        fields: [
          { id: 'name', type: 'T', name: 'Kundenname' },
          { id: 'work', type: 'T', name: 'Art der Arbeit' },
        ],
      }),
    },
  ],
  cards: [
    {
      id: CARD,
      name: `${TAG} Muster Küche`,
      desc: 'Bitte vorher anrufen.',
      idList: LIST,
      closed: false,
      pos: 1,
      pluginData: [{ idPlugin: 'p1', value: packed('FD', { name: `${TAG} Muster GmbH`, work: `${TRADE} und Küche` }) }],
    },
  ],
})!

const run = async () => {
  const { importTrello } = await import('@/app/(admin)/settings/import-trello/actions')
  const form = new FormData()
  form.set(`list_${LIST}`, 'APPROVED')
  form.set('includeFields', 'on')
  return importTrello({ step: 'preview', board, suggested: {} }, form)
}

const project = () =>
  prisma.project.findFirstOrThrow({
    where: { links: { some: { system: 'trello', externalId: CARD } } },
    select: { id: true, name: true, workNote: true, description: true, workCategories: { select: { workCategoryId: true } } },
  })

beforeAll(async () => {
  const user = await prisma.user.create({ data: { username: TAG, passwordHash: 'x', role: 'ADMIN' } })
  userId = user.id
  who.user = { ...user, employee: null }
  tradeId = (await prisma.workCategory.create({ data: { nameDe: TRADE, nameEn: TRADE, sortOrder: 950 } })).id
})

afterAll(async () => {
  const rows = await prisma.project.findMany({ where: { links: { some: { system: 'trello', externalId: CARD } } }, select: { id: true } })
  await prisma.project.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } })
  await prisma.customer.deleteMany({ where: { name: { startsWith: TAG } } })
  await prisma.workCategory.deleteMany({ where: { id: tradeId } })
  await prisma.auditLog.deleteMany({ where: { userId } })
  await prisma.user.delete({ where: { id: userId } })
  await prisma.$disconnect()
})

describe('"Art der Arbeit" from Trello', () => {
  it('becomes the trades and the work note, and the name of the project', async () => {
    expect((await run()).step).toBe('done')
    const row = await project()
    expect(row.workCategories.map((w) => w.workCategoryId)).toEqual([tradeId])
    expect(row.workNote).toBe('Küche')
    expect(row.name).toBe(`${TAG} Muster GmbH · ${TRADE}, Küche`)
    // The card's own text, without a line for the type of work.
    expect(row.description).toBe('Bitte vorher anrufen.')
  })

  it('keeps the note the office typed since', async () => {
    const { id } = await project()
    await prisma.project.update({ where: { id }, data: { workNote: 'Küche und Flur' } })
    expect((await run()).step).toBe('done')
    const row = await project()
    expect(row.workNote).toBe('Küche und Flur')
    expect(row.name).toBe(`${TAG} Muster GmbH · ${TRADE}, Küche und Flur`)
  })
})
