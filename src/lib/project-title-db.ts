import 'server-only'

import type { Prisma } from '@/generated/prisma/client'
import { db } from '@/lib/db'
import { projectTitle } from '@/lib/project-title'

/**
 * Keeps `Project.name` what src/lib/project-title.ts says it is: the customer
 * followed by the trades and the work note. Called wherever one of those changes — a project
 * saved, a label set on the card, an import, a customer or a trade renamed —
 * so every place that reads the name reads the current one.
 */

type Client = Prisma.TransactionClient | typeof db

const tradeNames = (rows: Array<{ nameDe: string; sortOrder: number }>) =>
  [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.nameDe.localeCompare(b.nameDe, 'de')).map((r) => r.nameDe)

/** The title a project about to be made will carry. */
export async function titleFor(
  input: { customerId: string; categoryIds: string[]; workNote?: string | null; sourceTitle?: string | null },
  client: Client = db
): Promise<string> {
  const [customer, trades] = await Promise.all([
    client.customer.findUnique({ where: { id: input.customerId }, select: { name: true } }),
    input.categoryIds.length > 0
      ? client.workCategory.findMany({ where: { id: { in: input.categoryIds } }, select: { nameDe: true, sortOrder: true } })
      : Promise.resolve([]),
  ])
  return projectTitle({ customer: customer?.name ?? '', trades: tradeNames(trades), workNote: input.workNote, sourceTitle: input.sourceTitle })
}

/**
 * The projects matched brought up to date; returns the ids whose name changed.
 * Nothing goes to Wattro: a project keeps there the name it was made with
 * (src/lib/wattro/projects.ts).
 */
export async function refreshProjectTitles(where: Prisma.ProjectWhereInput, client: Client = db): Promise<string[]> {
  const projects = await client.project.findMany({
    where,
    select: {
      id: true,
      name: true,
      sourceTitle: true,
      workNote: true,
      customer: { select: { name: true } },
      workCategories: { select: { workCategory: { select: { nameDe: true, sortOrder: true } } } },
    },
  })
  const changed: string[] = []
  for (const p of projects) {
    const name = projectTitle({
      customer: p.customer.name,
      trades: tradeNames(p.workCategories.map((w) => w.workCategory)),
      workNote: p.workNote,
      sourceTitle: p.sourceTitle,
    })
    if (name === p.name) continue
    await client.project.update({ where: { id: p.id }, data: { name } })
    changed.push(p.id)
  }
  return changed
}

/** One project brought up to date. */
export const refreshProjectTitle = (projectId: string, client: Client = db) => refreshProjectTitles({ id: projectId }, client)
