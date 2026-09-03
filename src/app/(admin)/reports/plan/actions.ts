'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireManagement, canViewFinancials } from '@/lib/authz'
import { audit } from '@/lib/audit'
import { suggestMatches, type MatchProject } from '@/lib/plan-match'

/** Financial data: the plan carries order values, so the same gate as revenue. */
async function requireFinancials() {
  const user = await requireManagement()
  if (!canViewFinancials(user)) throw new Error('forbidden')
  return user
}

function paths() {
  revalidatePath('/reports')
  revalidatePath('/reports/plan')
}

/** Ties one planned line to a project — or, with an empty id, unties it. */
export async function linkPlanEntry(
  entryId: string,
  projectId: string
): Promise<{ error?: string }> {
  const user = await requireFinancials()
  const entry = await db.planEntry.findUnique({
    where: { id: entryId },
    select: { id: true, name: true, projectId: true },
  })
  if (!entry) return { error: 'notFound' }

  const target = projectId || null
  if (target) {
    const project = await db.project.findUnique({ where: { id: target }, select: { id: true } })
    if (!project) return { error: 'notFound' }
  }

  await db.planEntry.update({ where: { id: entryId }, data: { projectId: target } })
  await audit({
    userId: user.id,
    action: target ? 'link' : 'unlink',
    entity: 'PlanEntry',
    entityId: entryId,
    field: entry.name,
    oldValue: entry.projectId,
    newValue: target,
  })
  paths()
  if (entry.projectId) revalidatePath(`/projects/${entry.projectId}`)
  if (target) revalidatePath(`/projects/${target}`)
  return {}
}

/**
 * Every suggestion the matcher is sure about, applied at once. Only lines that
 * are still free are touched, so an existing link is never overwritten.
 */
export async function applyPlanSuggestions(year: number): Promise<{ linked: number }> {
  const user = await requireFinancials()
  if (!Number.isInteger(year)) return { linked: 0 }

  const [entries, projects, taken] = await Promise.all([
    db.planEntry.findMany({
      where: { year, projectId: null },
      select: { id: true, name: true, month: true },
    }),
    db.project.findMany({
      where: { status: { not: 'CANCELLED' } },
      select: {
        id: true,
        number: true,
        name: true,
        plannedStart: true,
        customer: { select: { name: true } },
      },
    }),
    db.planEntry.findMany({
      where: { projectId: { not: null } },
      select: { projectId: true },
    }),
  ])

  const candidates: MatchProject[] = projects.map((p) => ({
    id: p.id,
    number: p.number,
    name: p.name,
    customer: p.customer.name,
    month: p.plannedStart ? p.plannedStart.getUTCMonth() : null,
  }))

  const suggestions = suggestMatches(
    entries,
    candidates,
    taken.map((t) => t.projectId!)
  )
  if (suggestions.length === 0) return { linked: 0 }

  await db.$transaction(
    suggestions.map((s) =>
      db.planEntry.update({ where: { id: s.entryId }, data: { projectId: s.projectId } })
    )
  )
  await audit({
    userId: user.id,
    action: 'link',
    entity: 'PlanEntry',
    entityId: String(year),
    newValue: `${suggestions.length} suggested links`,
  })
  paths()
  return { linked: suggestions.length }
}

/** Drops every link of a year, so the matching can be started over. */
export async function clearPlanLinks(year: number): Promise<{ cleared: number }> {
  const user = await requireFinancials()
  if (!Number.isInteger(year)) return { cleared: 0 }
  const result = await db.planEntry.updateMany({
    where: { year, projectId: { not: null } },
    data: { projectId: null },
  })
  await audit({
    userId: user.id,
    action: 'unlink',
    entity: 'PlanEntry',
    entityId: String(year),
    oldValue: `${result.count} links`,
  })
  paths()
  return { cleared: result.count }
}
