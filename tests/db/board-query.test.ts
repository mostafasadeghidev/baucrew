import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { boardProjectsWhere } from '@/lib/board-query'
import { columnFor, type RuleFacts } from '@/lib/board-rules'

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const tag = `vitest-board-query-${Date.now()}`
let customerId = ''
const thisYear = new Date('2026-12-31T00:00:00Z')
const nextYear = new Date('2027-01-01T00:00:00Z')
const facts: RuleFacts[] = [
  { pausedAt: null, priority: null, plannedStart: null, planMonth: null, invoice1: false },
  { pausedAt: thisYear, priority: null, plannedStart: null, planMonth: null, invoice1: false },
  { pausedAt: null, priority: 'LOW', plannedStart: null, planMonth: null, invoice1: false },
  { pausedAt: null, priority: null, plannedStart: nextYear, planMonth: null, invoice1: false },
  { pausedAt: null, priority: null, plannedStart: null, planMonth: nextYear, invoice1: false },
  // A fixed start must take precedence over a conflicting rough month.
  { pausedAt: null, priority: 'LOW', plannedStart: thisYear, planMonth: nextYear, invoice1: false },
  { pausedAt: null, priority: null, plannedStart: nextYear, planMonth: thisYear, invoice1: false },
  { pausedAt: thisYear, priority: 'LOW', plannedStart: nextYear, planMonth: null, invoice1: true },
  { pausedAt: null, priority: null, plannedStart: null, planMonth: null, invoice1: true },
]
const rows: Array<RuleFacts & { id: string; status: string }> = []
beforeAll(async () => {
  customerId = (await db.customer.create({ data: { number: tag, name: 'Muster Boardprüfung' } })).id
  for (const status of ['APPROVED', 'IN_PROGRESS', 'LEAD'] as const) {
    for (const fact of facts) {
      const { invoice1, ...fields } = fact
      const row = await db.project.create({ data: { ...fields, status, customerId, number: `${tag}-${rows.length}`, name: 'Muster Projekt', ...(invoice1 ? { invoices: { create: { part: 1 } } } : {}) } })
      rows.push({ ...fact, id: row.id, status })
    }
  }
})
afterAll(async () => {
  if (customerId) {
    await db.project.deleteMany({ where: { customerId } })
    await db.customer.delete({ where: { id: customerId } })
  }
  await db.$disconnect()
})

const boards = [
  [],
  [{ status: 'LEAD', rule: null }],
  [{ status: 'APPROVED', rule: 'nextYear' }],
  [{ status: 'APPROVED', rule: 'lowPriority' }],
  [{ status: 'IN_PROGRESS', rule: 'paused' }],
  [{ status: 'IN_PROGRESS', rule: 'invoice1' }],
  [{ status: 'APPROVED', rule: 'nextYear' }, { status: 'APPROVED', rule: 'lowPriority' }],
  [{ status: 'IN_PROGRESS', rule: 'invoice1' }, { status: 'IN_PROGRESS', rule: 'paused' }],
  [{ status: 'APPROVED', rule: 'nextYear' }, { status: 'APPROVED', rule: null }, { status: 'LEAD', rule: null }],
]
describe('board query membership', () => {
  it.each(boards.map((columns, index) => ({ index, columns })))('matches actual card placement for board $index', async ({ columns }) => {
    const keys = columns.map((column, index) => ({ ...column, key: String(index) }))
    const expected = rows.filter((row) => columnFor(keys, row.status, row, 2026)).map((row) => row.id).sort()
    const actual = await db.project.findMany({ where: { AND: [{ customerId }, boardProjectsWhere(columns, 2026)] }, select: { id: true } })
    expect(actual.map((row) => row.id).sort()).toEqual(expected)
  })
})
