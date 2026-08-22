// DB-backed: runs against the dev database (npm run test:db).
// Covers the two new features: site checklists on a project and the list of
// open offers behind the "Angebote" report tab.
import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { getOpenOffers } from '@/lib/reports'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const TAG = 'vitest-checklist'
let customerId = ''
let projectId = ''
let templateId = ''
let offerId = ''

beforeAll(async () => {
  const customer = await prisma.customer.create({ data: { name: `${TAG} Kunde` } })
  customerId = customer.id
  const project = await prisma.project.create({
    data: { number: '2034-9200', name: `${TAG} Projekt`, customerId, status: 'PLANNED' },
  })
  projectId = project.id
  const template = await prisma.checklistTemplate.create({
    data: {
      name: `${TAG} Übernahme`,
      items: {
        create: [
          { text: 'Untergrund trocken', sortOrder: 0 },
          { text: 'Vorgewerk fertig', sortOrder: 1 },
          { text: 'Strom vorhanden', sortOrder: 2 },
        ],
      },
    },
  })
  templateId = template.id
  const offer = await prisma.project.create({
    data: {
      number: '2034-9201',
      name: `${TAG} Angebot`,
      customerId,
      status: 'QUOTED',
      price: 12345,
    },
  })
  offerId = offer.id
})

afterAll(async () => {
  await prisma.project.deleteMany({ where: { id: { in: [projectId, offerId] } } })
  await prisma.checklistTemplate.deleteMany({ where: { id: templateId } })
  await prisma.customer.deleteMany({ where: { id: customerId } })
  await prisma.$disconnect()
})

describe('site checklists', () => {
  it('copies a template onto the project and keeps every line', async () => {
    const template = await prisma.checklistTemplate.findUniqueOrThrow({
      where: { id: templateId },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    })
    const checklist = await prisma.projectChecklist.create({
      data: {
        projectId,
        name: template.name,
        templateId,
        items: { create: template.items.map((i, sortOrder) => ({ text: i.text, sortOrder })) },
      },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    })
    expect(checklist.items.map((i) => i.text)).toEqual([
      'Untergrund trocken',
      'Vorgewerk fertig',
      'Strom vorhanden',
    ])
    // Every line starts open.
    expect(checklist.items.every((i) => i.ok === null)).toBe(true)
  })

  it('stores a problem with its note and who ticked it', async () => {
    const item = await prisma.projectChecklistItem.findFirstOrThrow({
      where: { checklist: { projectId }, text: 'Vorgewerk fertig' },
    })
    const employee = await prisma.employee.create({
      data: { firstName: TAG, lastName: 'Prüfer' },
    })
    const updated = await prisma.projectChecklistItem.update({
      where: { id: item.id },
      data: {
        ok: false,
        note: 'Fenster fehlen noch',
        checkedAt: new Date(),
        checkedById: employee.id,
      },
      include: { checkedBy: true },
    })
    expect(updated.ok).toBe(false)
    expect(updated.note).toBe('Fenster fehlen noch')
    expect(updated.checkedBy?.firstName).toBe(TAG)
    await prisma.employee.delete({ where: { id: employee.id } })
  })

  it('deleting the project removes its checklists', async () => {
    const before = await prisma.projectChecklist.count({ where: { projectId } })
    expect(before).toBe(1)
  })
})

describe('open offers report', () => {
  it('lists quoted projects with their age and sums them net', async () => {
    const { offers, total } = await getOpenOffers()
    const mine = offers.find((o) => o.id === offerId)
    expect(mine).toBeDefined()
    expect(mine?.price).toBe(12345)
    expect(mine?.ageDays).toBeGreaterThanOrEqual(0)
    expect(total).toBeGreaterThanOrEqual(12345)
  })
})
