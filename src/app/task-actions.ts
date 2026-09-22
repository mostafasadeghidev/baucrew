'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/authz'
import { canWorkOn } from '@/lib/crew-access'
import { canDeleteTask, parseTaskInput, type TaskResult } from '@/lib/tasks'
import { createTask, removeTask, setTaskDone } from '@/lib/tasks-db'

/**
 * Tasks, from the project page and from the crew's phone alike. Whoever may
 * work on the project may add a task and tick one off — a task is lighter
 * than a defect, and the crew ticks its own. Who it is given to and by when
 * is the office's to say; from the crew those two are left empty. Deleting:
 * the office any, the crew its own open ones.
 */

function refresh(projectId: string) {
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/projects')
  revalidatePath('/my')
}

export async function addTask(projectId: string, formData: FormData): Promise<TaskResult> {
  const user = await requireUser()
  if (!(await canWorkOn(user, projectId))) return { error: 'notAllowed' }
  const office = user.role !== 'EMPLOYEE'
  const task = parseTaskInput({
    title: formData.get('title'),
    description: formData.get('description'),
    dueDate: office ? formData.get('dueDate') : null,
    assigneeId: office ? formData.get('assigneeId') : null,
  })
  if (!task) return { error: 'titleRequired' }
  const result = await createTask({ projectId, userId: user.id, task })
  if ('error' in result) return { error: 'notFound' }
  refresh(projectId)
  return { id: result.id }
}

export async function completeTask(id: string, done: boolean): Promise<TaskResult> {
  const user = await requireUser()
  const task = await db.projectTask.findUnique({ where: { id }, select: { projectId: true } })
  if (!task) return { error: 'notFound' }
  if (!(await canWorkOn(user, task.projectId))) return { error: 'notAllowed' }
  const result = await setTaskDone({ id, userId: user.id, done })
  if ('error' in result) return { error: 'notFound' }
  refresh(result.projectId)
  return {}
}

export async function deleteTask(id: string): Promise<TaskResult> {
  const user = await requireUser()
  const task = await db.projectTask.findUnique({ where: { id }, select: { projectId: true, createdById: true, doneAt: true } })
  if (!task) return { error: 'notFound' }
  if (!canDeleteTask(user, task) || !(await canWorkOn(user, task.projectId))) return { error: 'notAllowed' }
  const result = await removeTask(id, user.id)
  if ('error' in result) return { error: 'notFound' }
  refresh(result.projectId)
  return {}
}
