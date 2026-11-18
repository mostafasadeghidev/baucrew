// DB-backed: runs against a throwaway database (npm run test:db).
// Baustellen is one board of the projects page, the one ticked for it: one
// board at most carries the tick, and a site manager sees on it only the
// projects they are named on, never a price (docs/CHANGE-baustellen-board.md).
import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { getBoards, saveBoardDraft } from '@/lib/boards-db'
import { sitesBoard } from '@/lib/boards'
import { boardProjectsWhere } from '@/lib/board-query'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const TAG = `vitest-sites-${Date.now()}`
/** The board that carried the tick before the tests, given it back afterwards. */
let before: string | null = null
let employeeId = ''
let managed = ''
let foreign = ''
let planned = ''

const draft = (name: string, showOnSites: boolean) => ({
  name,
  background: null,
  showOnSites,
  columns: [{ id: null, status: 'IN_PROGRESS' as const, title: 'Baustelle läuft', rule: null, color: null }],
})

beforeAll(async () => {
  before = sitesBoard(await getBoards())?.id ?? null
  const employee = await prisma.employee.create({ data: { firstName: 'Erika', lastName: TAG } })
  employeeId = employee.id
  const customer = await prisma.customer.create({ data: { name: `${TAG} Muster GmbH` } })
  const make = (suffix: string, extra: object) =>
    prisma.project.create({ data: { number: `${TAG}-${suffix}`, name: `${TAG} ${suffix}`, customerId: customer.id, price: 12_345, ...extra }, select: { id: true } })
  managed = (await make('managed', { status: 'IN_PROGRESS', managerId: employeeId })).id
  foreign = (await make('foreign', { status: 'IN_PROGRESS' })).id
  planned = (await make('planned', { status: 'PLANNED', managerId: employeeId })).id
})

afterAll(async () => {
  await prisma.board.deleteMany({ where: { name: { startsWith: TAG } } })
  if (before) await prisma.board.update({ where: { id: before }, data: { showOnSites: true } })
  await prisma.project.deleteMany({ where: { name: { startsWith: TAG } } })
  await prisma.customer.deleteMany({ where: { name: { startsWith: TAG } } })
  await prisma.employee.deleteMany({ where: { id: employeeId } })
  await prisma.$disconnect()
})

describe('the board Baustellen shows', () => {
  it('is one board at most: ticking another takes it off the first, a new board included', async () => {
    const first = await saveBoardDraft(null, draft(`${TAG} A`, true))
    expect(sitesBoard(await getBoards())?.id).toBe(first)

    const second = await saveBoardDraft(null, draft(`${TAG} B`, false))
    expect(sitesBoard(await getBoards())?.id).toBe(first)

    // The tick saved on an existing board moves it there.
    expect(await saveBoardDraft(second, draft(`${TAG} B`, true))).toBe(second)
    let ticked = (await getBoards()).filter((b) => b.showOnSites).map((b) => b.id)
    expect(ticked).toEqual([second])

    // And a new board made with the tick takes it over in turn.
    const third = await saveBoardDraft(null, draft(`${TAG} C`, true))
    ticked = (await getBoards()).filter((b) => b.showOnSites).map((b) => b.id)
    expect(ticked).toEqual([third])
  })

  it('is none once its tick is taken off', async () => {
    const current = sitesBoard(await getBoards())!
    await saveBoardDraft(current.id, draft(current.name, false))
    expect(sitesBoard(await getBoards())).toBeNull()
  })
})

describe('what a site manager sees on it', () => {
  it('is the board’s projects they are named on, and nothing else; the office sees all of the board', async () => {
    const { projectScope } = await import('@/lib/project-scope')
    const id = await saveBoardDraft(null, draft(`${TAG} Baustellen`, true))
    const board = (await getBoards()).find((b) => b.id === id)!
    expect(sitesBoard(await getBoards())?.id).toBe(id)
    // The board page's own where: the reader's scope and the board's columns, both.
    const onBoard = async (user: { role: string; employee: { id: string } | null }) =>
      (
        await prisma.project.findMany({
          where: { AND: [{ name: { startsWith: TAG } }, projectScope(user) ?? {}, boardProjectsWhere(board.columns, 2026), { archivedAt: null }] },
          select: { id: true },
        })
      ).map((p) => p.id)
    // The planned job is theirs too, but has no column on this board.
    expect(await onBoard({ role: 'SITE_MANAGER', employee: { id: employeeId } })).toEqual([managed])
    expect((await onBoard({ role: 'MANAGER', employee: null })).sort()).toEqual([managed, foreign].sort())
    expect(planned).toBeTruthy()
  })

  it('never carries a price for them', async () => {
    const { canViewFinancials } = await import('@/lib/authz')
    expect(canViewFinancials({ role: 'SITE_MANAGER', canViewFinancials: true })).toBe(false)
    expect(canViewFinancials({ role: 'ADMIN', canViewFinancials: false })).toBe(true)
  })
})
