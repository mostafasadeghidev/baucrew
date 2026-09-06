'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireManagement, canViewFinancials } from '@/lib/authz'
import { audit } from '@/lib/audit'
import {
  groupPlanJobs,
  jobSpan,
  matchProjectsToJobs,
  type JobProject,
  type PlanJob,
  type PlanLine,
} from '@/lib/plan-jobs'

/** Financial data: the plan carries order values, so the same gate as revenue. */
async function requireFinancials() {
  const user = await requireManagement()
  if (!canViewFinancials(user)) throw new Error('forbidden')
  return user
}

function paths(projectIds: string[] = []) {
  revalidatePath('/reports')
  revalidatePath('/reports/plan')
  for (const id of projectIds) revalidatePath(`/projects/${id}`)
}

const fmtDate = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Ties a whole job (all its lines) to one project and hands the project what
 * the sheet knows and it does not: the months it spans and the planned
 * amount. Dates and price are only filled where the project has none, so a
 * value the office typed in is never overwritten. The description records
 * where the figures came from.
 */
async function applyJob(job: PlanJob, projectId: string, stamp: string): Promise<void> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { plannedStart: true, plannedEnd: true, price: true, description: true },
  })
  if (!project) return
  const span = jobSpan(job)
  const filled: string[] = []
  const data: {
    plannedStart?: Date
    plannedEnd?: Date
    price?: number
    isSub?: boolean
    description?: string
  } = {}
  if (!project.plannedStart) {
    data.plannedStart = span.start
    filled.push(`Start ${fmtDate(span.start)}`)
  }
  if (!project.plannedEnd) {
    data.plannedEnd = span.end
    filled.push(`Ende ${fmtDate(span.end)}`)
  }
  if (project.price == null && job.amount > 0) {
    data.price = job.amount
    filled.push(`Auftragswert ${job.amount.toLocaleString('de-DE')} €`)
  }
  data.isSub = job.isSub
  if (filled.length) {
    const note = `Abgleich mit der Jahresplanung ${stamp}: ${filled.join(', ')} aus der Tabelle übernommen.`
    data.description = project.description ? `${project.description}\n\n${note}` : note
  }

  await db.$transaction([
    db.planEntry.updateMany({ where: { id: { in: job.lineIds } }, data: { projectId } }),
    db.project.update({ where: { id: projectId }, data }),
  ])
}

/**
 * Every free line of the sheet, all years at once: the matcher must see a
 * 2025 job and a 2026 job of the same site side by side to know that a
 * project fits both and is therefore not sure.
 */
async function freeLines(): Promise<PlanLine[]> {
  const rows = await db.planEntry.findMany({
    where: { projectId: null, month: { not: null } },
    select: { id: true, year: true, month: true, name: true, amount: true, isSub: true },
  })
  return rows.map((r) => ({ ...r, amount: Number(r.amount) }))
}

/** Projects that no plan line is tied to yet, as the matcher wants them. */
async function freeProjects(): Promise<JobProject[]> {
  const rows = await db.project.findMany({
    where: { status: { not: 'CANCELLED' }, planEntries: { none: {} } },
    select: {
      id: true,
      name: true,
      sourceCreatedAt: true,
      createdAt: true,
      customer: { select: { name: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    customer: r.customer.name,
    sourceCreatedAt: r.sourceCreatedAt,
    createdAt: r.createdAt,
  }))
}

export type ReconcileResult = {
  /** Jobs tied to a project, with dates and amount handed over. */
  applied: number
  /** Projects that fit more than one job — offered as a choice on the page. */
  choices: number
  /** Projects that fit no job of this year. */
  unmatched: number
}

/**
 * Runs the matcher over every free project and every free job of every year,
 * and applies only the sure matches. Everything else is left for a person.
 */
export async function reconcilePlan(): Promise<ReconcileResult> {
  const user = await requireFinancials()

  const [lines, projects] = await Promise.all([freeLines(), freeProjects()])
  const jobs = groupPlanJobs(lines)
  const matches = matchProjectsToJobs(projects, jobs)

  const stamp = fmtDate(new Date())
  let applied = 0
  let choices = 0
  let unmatched = 0
  const touched: string[] = []
  for (const m of matches) {
    if (m.sure) {
      await applyJob(m.sure, m.projectId, stamp)
      touched.push(m.projectId)
      applied++
    } else if (m.candidates.length > 0) choices++
    else unmatched++
  }

  await audit({
    userId: user.id,
    action: 'reconcile',
    entity: 'PlanEntry',
    entityId: 'all',
    newValue: `${applied} applied, ${choices} choices, ${unmatched} unmatched`,
  })
  paths(touched)
  return { applied, choices, unmatched }
}

/** A person ties one job to one project — all its lines at once. */
export async function linkPlanJob(lineIds: string[], projectId: string): Promise<{ error?: string }> {
  const user = await requireFinancials()
  if (!lineIds.length || !projectId) return { error: 'invalid' }

  const [rows, project] = await Promise.all([
    db.planEntry.findMany({
      where: { id: { in: lineIds }, projectId: null, month: { not: null } },
      select: { id: true, year: true, month: true, name: true, amount: true, isSub: true },
    }),
    db.project.findUnique({ where: { id: projectId }, select: { id: true } }),
  ])
  if (!project || rows.length === 0) return { error: 'notFound' }

  const [job] = groupPlanJobs(rows.map((r) => ({ ...r, amount: Number(r.amount) })))
  if (!job) return { error: 'invalid' }
  // The person chose these lines; the job must carry exactly them.
  job.lineIds = rows.map((r) => r.id)
  await applyJob(job, projectId, fmtDate(new Date()))

  await audit({
    userId: user.id,
    action: 'link',
    entity: 'PlanEntry',
    entityId: lineIds.join(','),
    field: job.names.join(' / '),
    newValue: projectId,
  })
  paths([projectId])
  return {}
}

/**
 * Unties a job's lines from their project. The project keeps whatever dates
 * and price it has — they may have been edited since, and an untied line is
 * not a reason to blank a project.
 */
export async function unlinkPlanJob(lineIds: string[]): Promise<{ error?: string }> {
  const user = await requireFinancials()
  if (!lineIds.length) return { error: 'invalid' }
  const rows = await db.planEntry.findMany({
    where: { id: { in: lineIds } },
    select: { id: true, projectId: true },
  })
  const projectIds = [...new Set(rows.map((r) => r.projectId).filter((x): x is string => !!x))]
  await db.planEntry.updateMany({ where: { id: { in: lineIds } }, data: { projectId: null } })
  await audit({
    userId: user.id,
    action: 'unlink',
    entity: 'PlanEntry',
    entityId: lineIds.join(','),
    oldValue: projectIds.join(','),
  })
  paths(projectIds)
  return {}
}

/** Drops every link of a year, so the matching can be started over. */
export async function clearPlanLinks(year: number): Promise<{ cleared: number }> {
  const user = await requireFinancials()
  if (!Number.isInteger(year)) return { cleared: 0 }
  const linked = await db.planEntry.findMany({
    where: { year, projectId: { not: null } },
    select: { projectId: true },
  })
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
  paths([...new Set(linked.map((l) => l.projectId!))])
  return { cleared: result.count }
}
