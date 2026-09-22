import { describe, expect, it } from 'vitest'
import { canDeleteTask, parseTaskInput, sortTasks, taskRows, type TaskRecord } from '@/lib/tasks'

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

describe('parseTaskInput', () => {
  it('wants a title, trims, and keeps a day only when it is one', () => {
    expect(parseTaskInput({ title: '  ' })).toBeNull()
    expect(parseTaskInput({ title: ' Gerüst bestellen ', dueDate: '2026-10-01', assigneeId: ' e1 ' })).toEqual({
      title: 'Gerüst bestellen',
      description: null,
      dueDate: '2026-10-01',
      assigneeId: 'e1',
    })
    expect(parseTaskInput({ title: 'x', dueDate: '01.10.2026' })?.dueDate).toBeNull()
  })
})

describe('sortTasks', () => {
  it('puts the open ones first, soonest due on top, and what is done last', () => {
    const rows = [
      { id: 'done-old', doneAt: day('2026-09-02'), dueDate: null, createdAt: day('2026-09-01') },
      { id: 'open-no-day', doneAt: null, dueDate: null, createdAt: day('2026-09-03') },
      { id: 'done-new', doneAt: day('2026-09-10'), dueDate: null, createdAt: day('2026-09-01') },
      { id: 'open-soon', doneAt: null, dueDate: day('2026-09-05'), createdAt: day('2026-09-04') },
    ]
    expect(sortTasks(rows).map((r) => r.id)).toEqual(['open-soon', 'open-no-day', 'done-new', 'done-old'])
  })
})

describe('canDeleteTask', () => {
  it('lets the office take any away, and the crew its own open ones', () => {
    expect(canDeleteTask({ id: 'boss', role: 'MANAGER' }, { createdById: 'u1', doneAt: day('2026-09-02') })).toBe(true)
    expect(canDeleteTask({ id: 'u1', role: 'EMPLOYEE' }, { createdById: 'u1', doneAt: null })).toBe(true)
    expect(canDeleteTask({ id: 'u2', role: 'EMPLOYEE' }, { createdById: 'u1', doneAt: null })).toBe(false)
    expect(canDeleteTask({ id: 'u1', role: 'EMPLOYEE' }, { createdById: 'u1', doneAt: day('2026-09-02') })).toBe(false)
  })
})

describe('taskRows', () => {
  it('puts a task into words for the reader, and knows which are theirs', () => {
    const record: TaskRecord = {
      id: 't1',
      title: 'Gerüst bestellen',
      description: null,
      dueDate: day('2026-09-20'),
      createdAt: day('2026-09-18'),
      doneAt: null,
      createdById: 'u1',
      assigneeId: 'e2',
      assignee: { firstName: 'Erika', lastName: 'Beispiel' },
      createdBy: { username: 'mmuster', employee: { firstName: 'Max', lastName: 'Muster' } },
      doneBy: null,
      project: { id: 'p1', number: '2026-0001', name: 'Musterhaus' },
    }
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    const [mine] = taskRows([record], { id: 'u2', role: 'EMPLOYEE', employeeId: 'e2' }, day('2026-09-21'), fmt)
    expect(mine).toEqual({
      id: 't1',
      title: 'Gerüst bestellen',
      description: null,
      due: { text: '2026-09-20', tone: 'late' },
      assignee: 'Erika Beispiel',
      mine: true,
      made: 'Max Muster · 2026-09-18',
      done: null,
      deletable: false,
      project: { id: 'p1', label: '2026-0001 — Musterhaus' },
    })
    const [other] = taskRows([record], { id: 'u1', role: 'MANAGER', employeeId: null }, day('2026-09-21'), fmt)
    expect(other.mine).toBe(false)
    expect(other.deletable).toBe(true)
  })
})
