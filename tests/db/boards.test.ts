// DB-backed: runs against the dev database (npm run test:db).
// The boards of the projects page: their columns, the order they are dragged
// into, and what saving the settings window does to them.
import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { getBoards, saveBoardDraft, saveColumnOrder, setBoardColumnColor } from '@/lib/boards-db'

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
  await prisma.board.deleteMany({ where: { name: { startsWith: TAG } } })
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

  it('saves the window’s draft: kept columns keep their id, left-out ones go, new ones are made, in the draft’s order', async () => {
    const before = (await getBoards()).find((b) => b.id === boardId)!
    const quoted = before.columns.find((c) => c.status === 'QUOTED')!
    expect(
      await saveBoardDraft(boardId, {
        name: `${TAG} neu`,
        background: 'green',
        showOnSites: false,
        columns: [
          { id: null, status: 'PLANNED', title: 'Termin steht', rule: null, color: 'sky' },
          { id: quoted.id, status: 'QUOTED', title: null, rule: null, color: 'rose' },
          { id: null, status: 'IN_PROGRESS', title: null, rule: 'paused', color: null },
        ],
      })
    ).toBe(boardId)
    const board = (await getBoards()).find((b) => b.id === boardId)!
    expect(board.name).toBe(`${TAG} neu`)
    expect(board.background).toBe('green')
    expect(board.columns.map((c) => [c.status, c.title, c.rule, c.color])).toEqual([
      ['PLANNED', 'Termin steht', null, 'sky'],
      ['QUOTED', null, null, 'rose'],
      ['IN_PROGRESS', null, 'paused', null],
    ])
    expect(board.columns[1].id).toBe(quoted.id)
    expect(await saveBoardDraft('no-such-board', { name: 'x', background: null, showOnSites: false, columns: [] })).toBeNull()
  })

  it('makes a new board from a draft, at the end of the tabs', async () => {
    const id = await saveBoardDraft(null, { name: TAG, background: null, showOnSites: false, columns: [{ id: null, status: 'LEAD', title: 'Anfragen', rule: null, color: 'amber' }] })
    const boards = await getBoards()
    expect(boards.at(-1)?.id).toBe(id)
    expect(boards.at(-1)?.columns.map((c) => [c.title, c.color])).toEqual([['Anfragen', 'amber']])
  })

  it('gives a list a colour from its menu, and takes it off again', async () => {
    const column = (await getBoards()).find((b) => b.id === boardId)!.columns[0]
    expect(await setBoardColumnColor(column.id, 'violet')).toBe(boardId)
    expect((await getBoards()).find((b) => b.id === boardId)!.columns[0].color).toBe('violet')
    expect(await setBoardColumnColor(column.id, null)).toBe(boardId)
    expect((await getBoards()).find((b) => b.id === boardId)!.columns[0].color).toBeNull()
    expect(await setBoardColumnColor('no-such-column', 'violet')).toBeNull()
  })
})
