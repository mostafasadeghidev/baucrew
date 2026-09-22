import 'server-only'
import { db } from './db'
import { audit } from './audit'
import { utcDate } from './dates'
import type { TaskInput } from './tasks'

const person = { username: true, employee: { select: { firstName: true, lastName: true } } } as const

/** What a task list reads — the shape `taskRows` takes (see `./tasks`). */
export const taskListSelect = {
  id: true,
  title: true,
  description: true,
  dueDate: true,
  createdAt: true,
  doneAt: true,
  createdById: true,
  assigneeId: true,
  assignee: { select: { firstName: true, lastName: true } },
  createdBy: { select: person },
  doneBy: { select: person },
} as const

export async function createTask(input: { projectId: string; userId: string; task: TaskInput }): Promise<{ id: string } | { error: 'notFound' }> {
  const project = await db.project.findUnique({ where: { id: input.projectId }, select: { id: true } })
  if (!project) return { error: 'notFound' }
  // Somebody who left gives nobody rather than an error.
  const assignee = input.task.assigneeId ? await db.employee.findUnique({ where: { id: input.task.assigneeId }, select: { id: true } }) : null
  const task = await db.projectTask.create({
    data: {
      projectId: project.id,
      title: input.task.title,
      description: input.task.description,
      dueDate: input.task.dueDate ? utcDate(input.task.dueDate) : null,
      assigneeId: assignee?.id ?? null,
      createdById: input.userId,
    },
    select: { id: true },
  })
  await audit({ userId: input.userId, action: 'project.task.create', entity: 'Project', entityId: project.id, newValue: input.task.title })
  return { id: task.id }
}

/** Ticked off, or open again. Marking what is already marked changes nothing. */
export async function setTaskDone(input: { id: string; userId: string; done: boolean }): Promise<{ projectId: string } | { error: 'notFound' }> {
  const task = await db.projectTask.findUnique({ where: { id: input.id }, select: { id: true, projectId: true, title: true, doneAt: true } })
  if (!task) return { error: 'notFound' }
  if (Boolean(task.doneAt) === input.done) return { projectId: task.projectId }
  await db.projectTask.update({
    where: { id: task.id },
    data: input.done ? { doneAt: new Date(), doneById: input.userId } : { doneAt: null, doneById: null },
  })
  await audit({
    userId: input.userId,
    action: input.done ? 'project.task.done' : 'project.task.reopen',
    entity: 'Project',
    entityId: task.projectId,
    newValue: task.title,
  })
  return { projectId: task.projectId }
}

export async function removeTask(id: string, userId: string): Promise<{ projectId: string } | { error: 'notFound' }> {
  const task = await db.projectTask.findUnique({ where: { id }, select: { id: true, projectId: true, title: true } })
  if (!task) return { error: 'notFound' }
  await db.projectTask.delete({ where: { id } })
  await audit({ userId, action: 'project.task.delete', entity: 'Project', entityId: task.projectId, oldValue: task.title })
  return { projectId: task.projectId }
}
