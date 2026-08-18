// DB-backed: runs against the dev database (npm run test:db).
// Guards the many-to-many between projects and vehicles (ProjectVehicle) —
// the queries used by the project form, dashboard and vehicle pages.
import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const TAG = 'vitest-project-vehicles'
let projectId = ''
let customerId = ''
const vehicleIds: string[] = []

beforeAll(async () => {
  const customer = await prisma.customer.create({ data: { name: `${TAG} Kunde` } })
  customerId = customer.id
  for (const name of [`${TAG} Bus`, `${TAG} Transporter`]) {
    const v = await prisma.vehicle.create({ data: { name } })
    vehicleIds.push(v.id)
  }
  const project = await prisma.project.create({
    data: {
      number: `2032-9001`,
      name: `${TAG} Projekt`,
      customerId,
      status: 'PLANNED',
      vehicles: { create: vehicleIds.map((id) => ({ vehicleId: id })) },
    },
  })
  projectId = project.id
})

afterAll(async () => {
  await prisma.project.deleteMany({ where: { id: projectId } })
  await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } })
  await prisma.customer.deleteMany({ where: { id: customerId } })
  await prisma.$disconnect()
})

describe('project ↔ vehicles', () => {
  it('reads both vehicles of a project (project page / work order)', async () => {
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: { vehicles: { include: { vehicle: true } } },
    })
    expect(project.vehicles.map((pv) => pv.vehicle.name).sort()).toEqual([`${TAG} Bus`, `${TAG} Transporter`])
  })

  it('counts projects per vehicle (vehicle list) and finds projects without a vehicle (dashboard)', async () => {
    const vehicle = await prisma.vehicle.findUniqueOrThrow({
      where: { id: vehicleIds[0] },
      include: { _count: { select: { projects: true } } },
    })
    expect(vehicle._count.projects).toBe(1)

    const withoutVehicle = await prisma.project.findMany({
      where: { id: projectId, vehicles: { none: {} } },
      select: { id: true },
    })
    expect(withoutVehicle).toHaveLength(0)
  })

  it('replaces the vehicle list on update (edit form)', async () => {
    await prisma.project.update({
      where: { id: projectId },
      data: { vehicles: { deleteMany: {}, create: [{ vehicleId: vehicleIds[1] }] } },
    })
    const after = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: { vehicles: true },
    })
    expect(after.vehicles.map((pv) => pv.vehicleId)).toEqual([vehicleIds[1]])
  })
})
