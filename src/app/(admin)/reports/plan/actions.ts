'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireManagement, canViewFinancials } from '@/lib/authz'
import { audit } from '@/lib/audit'
import {
  groupPlanJobs,
  jobSpan,
  matchProjectsToJobs,
  mergeJobs,
  type JobProject,
  type PlanJob,
  type PlanLine,
} from '@/lib/plan-jobs'
import { parsePlanLinks, serializePlanLinks, type PlanLinkRecord } from '@/lib/plan-links'

/** Statuses that mean the work is behind us. */
const DONE = new Set(['COMPLETED', 'INVOICED', 'PAID'])

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

/** The note applyJob leaves on a project, so takeBack can find and drop it. */
const NOTE_START = 'Abgleich mit der Jahresplanung '
const NOTE_END = ' aus der Tabelle übernommen.'

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
    const note = `${NOTE_START}${stamp}: ${filled.join(', ')}${NOTE_END}`
    data.description = project.description ? `${project.description}\n\n${note}` : note
  }

  await db.$transaction([
    db.planEntry.updateMany({ where: { id: { in: job.lineIds } }, data: { projectId } }),
    db.project.update({ where: { id: projectId }, data }),
  ])
}

/**
 * The reverse of applyJob, for a project whose last lines are being untied:
 * whatever still reads exactly as the sheet gave it — start, end, amount —
 * goes back to empty, and the note goes with it. A value the office has
 * changed since is theirs and stays. This is what lets the links of a year
 * be cleared and the matching started over without leaving figures behind.
 */
async function takeBack(projectId: string, lines: PlanLine[]): Promise<void> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { plannedStart: true, plannedEnd: true, price: true, description: true },
  })
  const jobs = groupPlanJobs(lines)
  if (!project || jobs.length === 0) return
  const job = mergeJobs(jobs)
  const span = jobSpan(job)
  const data: {
    plannedStart?: null
    plannedEnd?: null
    price?: null
    description?: string | null
  } = {}
  if (project.plannedStart && project.plannedStart.getTime() === span.start.getTime()) {
    data.plannedStart = null
  }
  if (project.plannedEnd && project.plannedEnd.getTime() === span.end.getTime()) {
    data.plannedEnd = null
  }
  if (project.price != null && Number(project.price) === job.amount) data.price = null
  if (project.description?.includes(NOTE_START)) {
    const kept = project.description
      .split('\n\n')
      .filter((p) => !(p.startsWith(NOTE_START) && p.endsWith(NOTE_END)))
      .join('\n\n')
    data.description = kept || null
  }
  if (Object.keys(data).length) await db.project.update({ where: { id: projectId }, data })
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

/**
 * Every project as the matcher wants it — the ones tied to lines already
 * included, with those lines folded into jobs, so they can take the phase
 * next to what they have and keep a namesake from taking it.
 */
async function allProjects(): Promise<JobProject[]> {
  const rows = await db.project.findMany({
    where: { status: { not: 'CANCELLED' } },
    select: {
      id: true,
      name: true,
      status: true,
      sourceCreatedAt: true,
      createdAt: true,
      customer: { select: { name: true } },
      planEntries: {
        where: { month: { not: null } },
        select: { id: true, year: true, month: true, name: true, amount: true, isSub: true },
      },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    customer: r.customer.name,
    sourceCreatedAt: r.sourceCreatedAt,
    createdAt: r.createdAt,
    done: DONE.has(r.status),
    linked: r.planEntries.length
      ? groupPlanJobs(r.planEntries.map((l) => ({ ...l, amount: Number(l.amount) })))
      : undefined,
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

  const [lines, projects] = await Promise.all([freeLines(), allProjects()])
  const jobs = groupPlanJobs(lines)
  const matches = matchProjectsToJobs(projects, jobs)
  const isLinked = new Set(projects.filter((p) => p.linked?.length).map((p) => p.id))

  const stamp = fmtDate(new Date())
  let applied = 0
  let choices = 0
  let unmatched = 0
  const touched: string[] = []
  for (const m of matches) {
    if (m.sure.length) {
      // A project doing one customer's job in phases takes all of them at once.
      await applyJob(mergeJobs(m.sure), m.projectId, stamp)
      touched.push(m.projectId)
      applied++
    } else if (isLinked.has(m.projectId)) continue
    else if (m.candidates.length > 0) choices++
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

  const jobs = groupPlanJobs(rows.map((r) => ({ ...r, amount: Number(r.amount) })))
  if (jobs.length === 0) return { error: 'invalid' }
  // The person chose these lines; the job must carry exactly them.
  const job = mergeJobs(jobs)
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
 * Unties a job's lines from their project. A project left with no line takes
 * back what the sheet gave it (see takeBack); one that keeps other lines
 * keeps its figures, since they may well come from those.
 */
export async function unlinkPlanJob(lineIds: string[]): Promise<{ error?: string }> {
  const user = await requireFinancials()
  if (!lineIds.length) return { error: 'invalid' }
  const rows = await db.planEntry.findMany({
    where: { id: { in: lineIds }, projectId: { not: null } },
    select: { id: true, year: true, month: true, name: true, amount: true, isSub: true, projectId: true },
  })
  const projectIds = [...new Set(rows.map((r) => r.projectId!))]
  await db.planEntry.updateMany({ where: { id: { in: lineIds } }, data: { projectId: null } })
  for (const projectId of projectIds) {
    const left = await db.planEntry.count({ where: { projectId } })
    if (left > 0) continue
    await takeBack(
      projectId,
      rows.filter((r) => r.projectId === projectId).map((r) => ({ ...r, amount: Number(r.amount) }))
    )
  }
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

/**
 * Drops every link of a year, so the matching can be started over. Projects
 * left without a line take back what the sheet gave them.
 */
export async function clearPlanLinks(year: number): Promise<{ cleared: number }> {
  const user = await requireFinancials()
  if (!Number.isInteger(year)) return { cleared: 0 }
  const linked = await db.planEntry.findMany({
    where: { year, projectId: { not: null } },
    select: { id: true, year: true, month: true, name: true, amount: true, isSub: true, projectId: true },
  })
  const result = await db.planEntry.updateMany({
    where: { year, projectId: { not: null } },
    data: { projectId: null },
  })
  const projectIds = [...new Set(linked.map((l) => l.projectId!))]
  for (const projectId of projectIds) {
    const left = await db.planEntry.count({ where: { projectId } })
    if (left > 0) continue
    await takeBack(
      projectId,
      linked.filter((l) => l.projectId === projectId).map((l) => ({ ...l, amount: Number(l.amount) }))
    )
  }
  await audit({
    userId: user.id,
    action: 'unlink',
    entity: 'PlanEntry',
    entityId: String(year),
    oldValue: `${result.count} links`,
  })
  paths(projectIds)
  return { cleared: result.count }
}

// ── Carrying the links from one installation to another ─────────────────

/** Every link there is, as a file a person can take to another installation. */
export async function exportPlanLinks(): Promise<string> {
  await requireFinancials()
  const rows = await db.planEntry.findMany({
    where: { projectId: { not: null }, month: { not: null } },
    orderBy: [{ year: 'asc' }, { month: 'asc' }, { name: 'asc' }],
    select: {
      year: true,
      month: true,
      name: true,
      amount: true,
      project: { select: { number: true, name: true, externalSystem: true, externalId: true } },
    },
  })
  return serializePlanLinks(
    rows.map((r) => ({
      year: r.year,
      month: r.month!,
      name: r.name,
      amount: Number(r.amount),
      project: {
        number: r.project!.number,
        name: r.project!.name,
        externalSystem: r.project!.externalSystem,
        externalId: r.project!.externalId,
      },
    }))
  )
}

export type LinkImportResult = {
  /** Lines tied to a project. */
  applied: number
  /** Lines that were tied already — here, a person's decision stands. */
  alreadyLinked: number
  /** Records whose project does not exist here. */
  missingProject: number
  /** Records whose line does not exist here (a different sheet, or none). */
  missingLine: number
  invalid?: true
}

/**
 * The project a record names, found the way it was named: by the record it
 * came from first (the same board card is the same project wherever it was
 * imported), then by number and name, then by a name nobody else has.
 */
async function findLinkedProject(p: PlanLinkRecord['project']): Promise<string | null> {
  if (p.externalSystem && p.externalId) {
    const hit = await db.project.findFirst({
      where: { externalSystem: p.externalSystem, externalId: p.externalId },
      select: { id: true },
    })
    if (hit) return hit.id
  }
  const byNumber = await db.project.findFirst({ where: { number: p.number, name: p.name }, select: { id: true } })
  if (byNumber) return byNumber.id
  const byName = await db.project.findMany({
    where: { name: p.name, status: { not: 'CANCELLED' } },
    select: { id: true },
    take: 2,
  })
  return byName.length === 1 ? byName[0].id : null
}

/**
 * Applies a links file: each record ties its line to its project the way a
 * person would on the page, with the same dates and amount handed over. A
 * line that is tied already is left as it is.
 */
export async function importPlanLinks(text: string): Promise<LinkImportResult> {
  const user = await requireFinancials()
  const links = parsePlanLinks(text)
  if (!links) return { applied: 0, alreadyLinked: 0, missingProject: 0, missingLine: 0, invalid: true }

  const result: LinkImportResult = { applied: 0, alreadyLinked: 0, missingProject: 0, missingLine: 0 }
  const projectOf = new Map<string, string | null>()
  const linesFor = new Map<string, PlanLine[]>()
  const taken = new Set<string>()
  for (const link of links) {
    const key = [link.project.externalSystem, link.project.externalId, link.project.number, link.project.name].join('|')
    if (!projectOf.has(key)) projectOf.set(key, await findLinkedProject(link.project))
    const projectId = projectOf.get(key)
    if (!projectId) {
      result.missingProject++
      continue
    }
    const rows = await db.planEntry.findMany({
      where: { year: link.year, month: link.month, name: link.name, amount: link.amount },
      select: { id: true, year: true, month: true, name: true, amount: true, isSub: true, projectId: true },
    })
    if (rows.length === 0) {
      result.missingLine++
      continue
    }
    // Two identical lines in one month are two records in the file too.
    const free = rows.find((r) => !r.projectId && !taken.has(r.id))
    if (!free) {
      result.alreadyLinked++
      continue
    }
    taken.add(free.id)
    linesFor.set(projectId, [...(linesFor.get(projectId) ?? []), { ...free, amount: Number(free.amount) }])
  }

  const stamp = fmtDate(new Date())
  for (const [projectId, lines] of linesFor) {
    const jobs = groupPlanJobs(lines)
    if (jobs.length === 0) continue
    const job = mergeJobs(jobs)
    job.lineIds = lines.map((l) => l.id)
    await applyJob(job, projectId, stamp)
    result.applied += lines.length
  }

  await audit({
    userId: user.id,
    action: 'import',
    entity: 'PlanEntry',
    entityId: 'links',
    newValue: `${result.applied} applied, ${result.alreadyLinked} already linked, ${result.missingProject} without project, ${result.missingLine} without line`,
  })
  paths([...linesFor.keys()])
  return result
}
