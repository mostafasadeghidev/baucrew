import 'server-only'
import { db } from './db'
import { audit } from './audit'
import { utcDate } from './dates'
import type { DefectInput } from './defects'
import { announceDefect, type EventActor } from './project-events'

const person = { username: true, employee: { select: { firstName: true, lastName: true } } } as const

/** What a defect list reads — the shape `defectRows` takes (see `./defects`). */
export const defectListSelect = {
  id: true,
  title: true,
  description: true,
  location: true,
  dueDate: true,
  createdAt: true,
  resolvedAt: true,
  reportedById: true,
  assignee: { select: { firstName: true, lastName: true } },
  reportedBy: { select: person },
  resolvedBy: { select: person },
  photos: { select: { id: true, filename: true }, orderBy: { createdAt: 'asc' } },
} as const

/**
 * A defect noted on a project — from the project page, the crew's phone or the
 * API — and told to the automations. Its photos are uploaded afterwards, one
 * by one, against the id this gives back.
 */
export async function createDefect(input: {
  projectId: string
  reporterId: string
  defect: DefectInput
  actor: EventActor
}): Promise<{ id: string } | { error: 'notFound' }> {
  const project = await db.project.findUnique({ where: { id: input.projectId }, select: { id: true } })
  if (!project) return { error: 'notFound' }
  // Somebody who left, or an id from another system, gives nobody rather than an error.
  const assignee = input.defect.assigneeId
    ? await db.employee.findUnique({ where: { id: input.defect.assigneeId }, select: { id: true } })
    : null
  const defect = await db.defect.create({
    data: {
      projectId: project.id,
      title: input.defect.title,
      description: input.defect.description,
      location: input.defect.location,
      dueDate: input.defect.dueDate ? utcDate(input.defect.dueDate) : null,
      assigneeId: assignee?.id ?? null,
      reportedById: input.reporterId,
    },
    select: { id: true },
  })
  await audit({
    userId: input.reporterId,
    action: 'project.defect.report',
    entity: 'Project',
    entityId: project.id,
    newValue: input.defect.title,
  })
  await announceDefect(defect.id, 'defect.reported', input.actor)
  return { id: defect.id }
}

/**
 * Put right, or not after all. Marking what is already marked changes nothing
 * and tells nobody; taking the mark away is silent too — an automation hears
 * "reported" and "resolved", not the office changing its mind.
 */
export async function setDefectResolved(input: {
  id: string
  userId: string
  resolved: boolean
  actor: EventActor
}): Promise<{ projectId: string } | { error: 'notFound' }> {
  const defect = await db.defect.findUnique({
    where: { id: input.id },
    select: { id: true, projectId: true, title: true, resolvedAt: true },
  })
  if (!defect) return { error: 'notFound' }
  if (Boolean(defect.resolvedAt) === input.resolved) return { projectId: defect.projectId }
  await db.defect.update({
    where: { id: defect.id },
    data: input.resolved ? { resolvedAt: new Date(), resolvedById: input.userId } : { resolvedAt: null, resolvedById: null },
  })
  await audit({
    userId: input.userId,
    action: input.resolved ? 'project.defect.resolve' : 'project.defect.reopen',
    entity: 'Project',
    entityId: defect.projectId,
    newValue: defect.title,
  })
  if (input.resolved) await announceDefect(defect.id, 'defect.resolved', input.actor)
  return { projectId: defect.projectId }
}

/** Takes a defect away. Its photos stay on the project, as files. */
export async function removeDefect(id: string, userId: string): Promise<{ projectId: string } | { error: 'notFound' }> {
  const defect = await db.defect.findUnique({ where: { id }, select: { id: true, projectId: true, title: true } })
  if (!defect) return { error: 'notFound' }
  await db.defect.delete({ where: { id } })
  await audit({
    userId,
    action: 'project.defect.delete',
    entity: 'Project',
    entityId: defect.projectId,
    oldValue: defect.title,
  })
  return { projectId: defect.projectId }
}
