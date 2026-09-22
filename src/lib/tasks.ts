/**
 * Tasks on a project — what somebody has to do apart from the trades' own
 * work: order the scaffold, ask the customer about the colour, send the
 * photos to the office. Given to somebody, due by a day, open until it is
 * ticked off.
 *
 * Pure, so the rules are tested without a database.
 */

import { defectTone, type DefectTone } from './defects'

export const TASK_TITLE_MAX = 200
export const TASK_TEXT_MAX = 2000

export type TaskResult = { error?: 'titleRequired' | 'notAllowed' | 'notFound' | 'saveFailed'; id?: string }

export type TaskInput = {
  title: string
  description: string | null
  /** yyyy-mm-dd, or null. */
  dueDate: string | null
  assigneeId: string | null
}

const clean = (value: unknown, max: number): string | null => {
  const text = typeof value === 'string' ? value.trim().slice(0, max) : ''
  return text || null
}

/** A task as a form or an automation sends it; null when it has no title. */
export function parseTaskInput(raw: { title?: unknown; description?: unknown; dueDate?: unknown; assigneeId?: unknown }): TaskInput | null {
  const title = clean(raw.title, TASK_TITLE_MAX)
  if (!title) return null
  const due = clean(raw.dueDate, 10)
  return {
    title,
    description: clean(raw.description, TASK_TEXT_MAX),
    dueDate: due && /^\d{4}-\d{2}-\d{2}$/.test(due) && !Number.isNaN(Date.parse(`${due}T00:00:00Z`)) ? due : null,
    assigneeId: clean(raw.assigneeId, 60),
  }
}

/** Whether an open task's day presses: the same rule a defect's has — red past it, amber in the last three days. */
export const taskTone = (dueDate: Date | null, doneAt: Date | null, today: Date): DefectTone => defectTone(dueDate, doneAt, today)

type Sortable = { doneAt: Date | null; dueDate: Date | null; createdAt: Date }

/** The open ones first — soonest due on top, those without a day after, oldest first — then what is done, the latest on top. */
export function sortTasks<T extends Sortable>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    if (!a.doneAt !== !b.doneAt) return a.doneAt ? 1 : -1
    if (a.doneAt && b.doneAt) return b.doneAt.getTime() - a.doneAt.getTime()
    const dueA = a.dueDate?.getTime() ?? Infinity
    const dueB = b.dueDate?.getTime() ?? Infinity
    if (dueA !== dueB) return dueA - dueB
    return a.createdAt.getTime() - b.createdAt.getTime()
  })
}

/** Who may take a task away: the office any; whoever made it their own while it is still open. */
export function canDeleteTask(user: { id: string; role: string }, task: { createdById: string | null; doneAt: Date | null }): boolean {
  if (user.role !== 'EMPLOYEE') return true
  return task.createdById === user.id && !task.doneAt
}

/** A task as a list draws it: everything already in words. */
export type TaskRow = {
  id: string
  title: string
  description: string | null
  due: { text: string; tone: DefectTone } | null
  assignee: string | null
  /** True when the reader is the one it was given to. */
  mine: boolean
  /** "Max Muster · 21.09.26" */
  made: string
  /** "Erika Beispiel · 22.09.26" once it is done; null while it is open. */
  done: string | null
  deletable: boolean
  /** The project, where a list spans several — "2026-0048 — Musterhaus". */
  project?: { id: string; label: string }
}

type Person = { username: string; employee: { firstName: string; lastName: string } | null } | null

export type TaskRecord = {
  id: string
  title: string
  description: string | null
  dueDate: Date | null
  createdAt: Date
  doneAt: Date | null
  createdById: string | null
  assigneeId: string | null
  assignee: { firstName: string; lastName: string } | null
  createdBy: Person
  doneBy: Person
  project?: { id: string; number: string; name: string }
}

const personName = (person: Person): string | null =>
  person ? (person.employee ? `${person.employee.firstName} ${person.employee.lastName}`.trim() : person.username) : null

/** The rows of a task list, in reading order, for one reader. */
export function taskRows(
  records: TaskRecord[],
  reader: { id: string; role: string; employeeId: string | null },
  today: Date,
  formatDay: (date: Date) => string
): TaskRow[] {
  const signed = (who: Person, when: Date) => [personName(who), formatDay(when)].filter(Boolean).join(' · ')
  return sortTasks(records).map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    due: t.dueDate ? { text: formatDay(t.dueDate), tone: taskTone(t.dueDate, t.doneAt, today) } : null,
    assignee: t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}`.trim() : null,
    mine: t.assigneeId !== null && t.assigneeId === reader.employeeId,
    made: signed(t.createdBy, t.createdAt),
    done: t.doneAt ? signed(t.doneBy, t.doneAt) : null,
    deletable: canDeleteTask(reader, t),
    ...(t.project ? { project: { id: t.project.id, label: `${t.project.number} — ${t.project.name}` } } : {}),
  }))
}
