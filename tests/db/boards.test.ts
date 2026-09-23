// DB-backed: runs against the dev database (npm run test:db).
// The boards of the projects page: their columns, the order they are dragged
// into, and what the settings form does to them.
import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { getBoards, saveBoardColumns, saveColumnOrder } from '@/lib/boards-db'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const TAG = `vitest-boards-${Date.now()}`
let boardId = ''

beforeAll(async () => {
  const board = await prisma.board.create({
    data: {
      name: TAG,
      sortOrder: 9_999,
      columns: {
        create: [
          { status: 'LEAD', sortOrder: 0 },
          { status: 'QUOTED', title: 'Angebot fertig', sortOrder: 1 },
          { status: 'APPROVED', sortOrder: 2 },
        ],
      },
    },
  })
  boardId = board.id
})

afterAll(async () => {
  await prisma.board.deleteMany({ where: { name: TAG } })
  await prisma.$disconnect()
})

describe('boards', () => {
  it('lists a board with its columns left to right, each with its own name when it has one', async () => {
    const board = (await getBoards()).find((b) => b.id === boardId)
    expect(board?.columns.map((c) => [c.status, c.title])).toEqual([
      ['LEAD', null],
      ['QUOTED', 'Angebot fertig'],
      ['APPROVED', null],
    ])
  })

  it('takes the order a board was dragged into, as column ids; a column left out keeps its place after the ones named', async () => {
    const before = (await getBoards()).find((b) => b.id === boardId)!
    const idOf = (status: string) => before.columns.find((c) => c.status === status)!.id
    expect(await saveColumnOrder(boardId, [idOf('APPROVED'), 'NOPE', idOf('LEAD')])).toBe(true)
    const board = (await getBoards()).find((b) => b.id === boardId)
    expect(board?.columns.map((c) => c.status)).toEqual(['APPROVED', 'LEAD', 'QUOTED'])
    expect(await saveColumnOrder('no-such-board', [idOf('LEAD')])).toBe(false)
  })

  it('replaces the columns as the settings form sent them, names included', async () => {
    await saveBoardColumns(boardId, [
      { status: 'QUOTED', title: null },
      { status: 'PLANNED', title: 'Termin steht' },
    ])
    const board = (await getBoards()).find((b) => b.id === boardId)
    expect(board?.columns.map((c) => [c.status, c.title])).toEqual([
      ['QUOTED', null],
      ['PLANNED', 'Termin steht'],
    ])
  })
})
