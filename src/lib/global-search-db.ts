import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import type { CurrentUser } from './auth'
import { isOffice } from './authz'
import { db } from './db'
import { projectScope } from './project-scope'
import { queryWords, rankRows, wordVariants, type SearchField } from './global-search'

/**
 * What the search window (⌘K) finds, for one user: projects first — only
 * those the user sees (`projectScope`: a site manager the ones they are named
 * on) — then, for the office alone, customers, employees, vehicles and
 * devices. Nothing with a price in it is read, so nothing with a price can
 * come back.
 *
 * Each group asks the database for a handful more candidates than it shows
 * and `rankRows` (src/lib/global-search.ts) puts them in order.
 */

/** How many of a group the window shows, and how many candidates it ranks. */
const SHOW = { projects: 8, other: 4 }
const CANDIDATES = { projects: 40, other: 16 }

export type SearchHit = {
  /** Where the hit leads; projects are opened by the window itself (card or page). */
  href: string
  id: string
  title: string
  /** Parts of the muted line under the title; the window joins them. */
  meta: (string | null)[]
  /** No longer in use (a former employee, a sold vehicle): said in the line under it. */
  inactive?: boolean
}

export type ProjectHit = {
  id: string
  title: string
  number: string
  jobNumber: string | null
  status: string
  customer: string | null
  city: string | null
  archived: boolean
}

export type SearchResults = {
  projects: ProjectHit[]
  customers: SearchHit[]
  employees: SearchHit[]
  vehicles: SearchHit[]
  devices: SearchHit[]
}

export const NO_RESULTS: SearchResults = { projects: [], customers: [], employees: [], vehicles: [], devices: [] }

/**
 * Every word in one of these fields, in one of its spellings — the `where`
 * of each group. `field` turns a spelling into the condition on one column.
 */
function everyWord<W>(words: string[], fields: ((v: string) => W)[]): { AND: { OR: W[] }[] } {
  return { AND: words.map((w) => ({ OR: wordVariants(w).flatMap((v) => fields.map((f) => f(v))) })) }
}

const ci = (v: string) => ({ contains: v, mode: 'insensitive' as const })

export async function searchEverything(user: CurrentUser, q: string): Promise<SearchResults> {
  const words = queryWords(q)
  if (words.length === 0) return NO_RESULTS
  const office = isOffice(user)
  const scope = projectScope(user)

  const projectWhere: Prisma.ProjectWhereInput = {
    AND: [
      ...(scope ? [scope] : []),
      everyWord<Prisma.ProjectWhereInput>(words, [
        (v) => ({ number: ci(v) }),
        (v) => ({ jobNumber: ci(v) }),
        (v) => ({ name: ci(v) }),
        // The title it had before the name became customer and trades — the office still knows it by that.
        (v) => ({ sourceTitle: ci(v) }),
        (v) => ({ customer: { name: ci(v) } }),
        (v) => ({ street: ci(v) }),
        (v) => ({ city: ci(v) }),
        (v) => ({ postalCode: { startsWith: v } }),
      ]),
    ],
  }

  const [projects, customers, employees, vehicles, devices] = await Promise.all([
    db.project.findMany({
      where: projectWhere,
      // Running work before the archive, the newest before the old.
      orderBy: [{ archivedAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
      take: CANDIDATES.projects,
      select: {
        id: true,
        number: true,
        jobNumber: true,
        name: true,
        sourceTitle: true,
        status: true,
        street: true,
        city: true,
        postalCode: true,
        archivedAt: true,
        customer: { select: { name: true } },
      },
    }),
    office
      ? db.customer.findMany({
          where: everyWord<Prisma.CustomerWhereInput>(words, [
            (v) => ({ name: ci(v) }),
            (v) => ({ number: ci(v) }),
            (v) => ({ company: ci(v) }),
            (v) => ({ contactPerson: ci(v) }),
            (v) => ({ city: ci(v) }),
          ]),
          orderBy: { name: 'asc' },
          take: CANDIDATES.other,
          select: { id: true, name: true, number: true, company: true, contactPerson: true, city: true },
        })
      : [],
    office
      ? db.employee.findMany({
          where: everyWord<Prisma.EmployeeWhereInput>(words, [(v) => ({ firstName: ci(v) }), (v) => ({ lastName: ci(v) })]),
          orderBy: [{ active: 'desc' }, { lastName: 'asc' }],
          take: CANDIDATES.other,
          select: { id: true, firstName: true, lastName: true, phone: true, active: true },
        })
      : [],
    office
      ? db.vehicle.findMany({
          where: everyWord<Prisma.VehicleWhereInput>(words, [
            (v) => ({ name: ci(v) }),
            (v) => ({ licensePlate: ci(v) }),
            (v) => ({ type: ci(v) }),
          ]),
          orderBy: [{ active: 'desc' }, { name: 'asc' }],
          take: CANDIDATES.other,
          select: { id: true, name: true, licensePlate: true, type: true, active: true },
        })
      : [],
    office
      ? db.device.findMany({
          where: everyWord<Prisma.DeviceWhereInput>(words, [
            (v) => ({ name: ci(v) }),
            (v) => ({ inventoryNo: ci(v) }),
            (v) => ({ category: ci(v) }),
          ]),
          orderBy: [{ active: 'desc' }, { name: 'asc' }],
          take: CANDIDATES.other,
          select: { id: true, name: true, inventoryNo: true, category: true, active: true },
        })
      : [],
  ])

  const projectFields = (p: (typeof projects)[number]): SearchField[] => [
    { text: p.number, weight: 5, code: true },
    { text: p.jobNumber, weight: 5, code: true },
    { text: p.name, weight: 3 },
    { text: p.sourceTitle, weight: 2 },
    { text: p.customer?.name, weight: 2 },
    { text: p.street, weight: 1 },
    { text: p.city, weight: 1 },
    { text: p.postalCode, weight: 1, code: true },
  ]

  return {
    projects: rankRows(projects, words, projectFields, SHOW.projects).map((p) => ({
      id: p.id,
      title: p.name,
      number: p.number,
      jobNumber: p.jobNumber,
      status: p.status,
      customer: p.customer?.name ?? null,
      city: p.city,
      archived: p.archivedAt !== null,
    })),
    customers: rankRows(
      customers,
      words,
      (c) => [
        { text: c.name, weight: 3 },
        { text: c.number, weight: 4, code: true },
        { text: c.company, weight: 2 },
        { text: c.contactPerson, weight: 2 },
        { text: c.city, weight: 1 },
      ],
      SHOW.other
    ).map((c) => ({ id: c.id, href: `/customers/${c.id}`, title: c.name, meta: [c.number, c.contactPerson, c.city] })),
    employees: rankRows(
      employees,
      words,
      (e) => [
        { text: e.firstName, weight: 3 },
        { text: e.lastName, weight: 3 },
        { text: `${e.firstName} ${e.lastName}`, weight: 2 },
      ],
      SHOW.other
    ).map((e) => ({
      id: e.id,
      href: `/employees/${e.id}`,
      title: `${e.firstName} ${e.lastName}`.trim(),
      inactive: !e.active,
      meta: [e.phone],
    })),
    vehicles: rankRows(
      vehicles,
      words,
      (v) => [
        { text: v.name, weight: 3 },
        { text: v.licensePlate, weight: 3 },
        { text: v.type, weight: 1 },
      ],
      SHOW.other
    ).map((v) => ({
      id: v.id,
      href: `/vehicles/${v.id}`,
      title: v.name,
      inactive: !v.active,
      meta: [v.licensePlate, v.type],
    })),
    devices: rankRows(
      devices,
      words,
      (d) => [
        { text: d.name, weight: 3 },
        { text: d.inventoryNo, weight: 4, code: true },
        { text: d.category, weight: 1 },
      ],
      SHOW.other
    ).map((d) => ({
      id: d.id,
      href: `/devices/${d.id}`,
      title: d.name,
      inactive: !d.active,
      meta: [d.inventoryNo, d.category],
    })),
  }
}
