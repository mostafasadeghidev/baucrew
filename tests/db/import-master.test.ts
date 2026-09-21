// DB-backed: runs against the dev database (npm run test:db).
// Customers, employees and vehicles from a sheet: new ones are made, the ones
// already there are found and filled in, and nobody is made twice.
import 'dotenv/config'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const TAG = `vitest-master-${Date.now()}`

afterAll(async () => {
  await prisma.customer.deleteMany({ where: { name: { startsWith: TAG } } })
  await prisma.employee.deleteMany({ where: { lastName: { startsWith: TAG } } })
  await prisma.vehicle.deleteMany({ where: { name: { startsWith: TAG } } })
  await prisma.$disconnect()
})

describe('the master data import', () => {
  it('makes new customers, finds the ones there by number or name, and fills only what is empty', async () => {
    const { runMasterImport } = await import('@/lib/import-master-server')
    await prisma.customer.create({ data: { name: `${TAG} Muster GmbH`, phone: '01234 1' } })
    await prisma.customer.create({ data: { name: `${TAG} Alt & Söhne`, number: `${TAG}-7` } })

    const sheet = {
      headers: ['Nr', 'Name', 'Telefon', 'Ort'],
      rows: [
        [`${TAG}-1`, `${TAG} muster gmbh`, '01234 2', 'Musterstadt'], // found by name, gets a number and a town
        [`${TAG}-7`, `${TAG} Alt und Söhne KG`, '', 'Beispielheim'], // found by number though the name differs
        [`${TAG}-9`, `${TAG} Neu AG`, '0171 3', ''], // new
        [`${TAG}-9`, `${TAG} Neu AG`, '', 'Musterdorf'], // the same again: fills the one just made
        ['', '', '0000', ''], // no name
      ],
    }
    const mapping = { number: 'Nr', name: 'Name', phone: 'Telefon', city: 'Ort' }
    expect(await runMasterImport('customers', sheet, mapping, false)).toEqual({ created: 1, updated: 3, unchanged: 0, skipped: 1 })

    const rows = await prisma.customer.findMany({ where: { name: { startsWith: TAG } }, orderBy: { name: 'asc' } })
    expect(rows.map((c) => [c.name, c.number, c.phone, c.city])).toEqual([
      [`${TAG} Alt & Söhne`, `${TAG}-7`, null, 'Beispielheim'],
      [`${TAG} Muster GmbH`, `${TAG}-1`, '01234 1', 'Musterstadt'],
      [`${TAG} Neu AG`, `${TAG}-9`, '0171 3', 'Musterdorf'],
    ])

    // The same file again changes nothing; told to overwrite, the phone follows the file.
    expect(await runMasterImport('customers', sheet, mapping, false)).toMatchObject({ created: 0, updated: 0, unchanged: 4 })
    await runMasterImport('customers', sheet, mapping, true)
    expect((await prisma.customer.findFirst({ where: { number: `${TAG}-1` } }))?.phone).toBe('01234 2')
  })

  it('makes employees from whole names and vehicles by their plate', async () => {
    const { runMasterImport } = await import('@/lib/import-master-server')
    const people = { headers: ['Name', 'Handy'], rows: [[`${TAG}, Max`, '0171 1'], [`Erika ${TAG}`, ''], [`Erika ${TAG}`, '0171 2']] }
    expect(await runMasterImport('employees', people, { fullName: 'Name', phone: 'Handy' }, false)).toEqual({ created: 2, updated: 1, unchanged: 0, skipped: 0 })
    const staff = await prisma.employee.findMany({ where: { lastName: TAG }, orderBy: { firstName: 'asc' } })
    expect(staff.map((e) => [e.firstName, e.phone])).toEqual([
      ['Erika', '0171 2'],
      ['Max', '0171 1'],
    ])

    const cars = { headers: ['Fahrzeug', 'Kennzeichen'], rows: [[`${TAG} Bus 1`, 'XX-YY 1'], [`${TAG} Bus eins`, 'xx yy1']] }
    expect(await runMasterImport('vehicles', cars, { name: 'Fahrzeug', licensePlate: 'Kennzeichen' }, false)).toEqual({ created: 1, updated: 0, unchanged: 1, skipped: 0 })
  })
})
