import { describe, expect, it } from 'vitest'
import { canDeleteDefect, defectRows, defectTone, parseDefectInput, sortDefects, type DefectRecord } from '@/lib/defects'

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

describe('parseDefectInput', () => {
  it('wants a title and trims what it is given', () => {
    expect(parseDefectInput({ title: '   ' })).toBeNull()
    expect(parseDefectInput({})).toBeNull()
    expect(parseDefectInput({ title: '  Riss in der Decke ', location: ' Bad OG ', description: '' })).toEqual({
      title: 'Riss in der Decke',
      description: null,
      location: 'Bad OG',
      dueDate: null,
      assigneeId: null,
    })
  })

  it('keeps a day only when it is one', () => {
    expect(parseDefectInput({ title: 'x', dueDate: '2026-10-01' })?.dueDate).toBe('2026-10-01')
    expect(parseDefectInput({ title: 'x', dueDate: '01.10.2026' })?.dueDate).toBeNull()
    expect(parseDefectInput({ title: 'x', dueDate: '2026-13-45' })?.dueDate).toBeNull()
  })

  it('cuts what is too long rather than refusing it', () => {
    expect(parseDefectInput({ title: 'a'.repeat(500) })?.title).toHaveLength(200)
  })
})

describe('defectTone', () => {
  const today = day('2026-09-21')

  it('is red past the day and amber in the days before it', () => {
    expect(defectTone(day('2026-09-20'), null, today)).toBe('late')
    expect(defectTone(day('2026-09-21'), null, today)).toBe('soon')
    expect(defectTone(day('2026-09-24'), null, today)).toBe('soon')
    expect(defectTone(day('2026-09-25'), null, today)).toBeNull()
  })

  it('wears no colour without a day, or once it is put right', () => {
    expect(defectTone(null, null, today)).toBeNull()
    expect(defectTone(day('2026-09-01'), day('2026-09-02'), today)).toBeNull()
  })
})

describe('sortDefects', () => {
  it('puts the open ones first, soonest due on top, and what is done last', () => {
    const rows = [
      { id: 'done-old', resolvedAt: day('2026-09-02'), dueDate: null, createdAt: day('2026-09-01') },
      { id: 'open-no-day', resolvedAt: null, dueDate: null, createdAt: day('2026-09-03') },
      { id: 'done-new', resolvedAt: day('2026-09-10'), dueDate: null, createdAt: day('2026-09-01') },
      { id: 'open-late', resolvedAt: null, dueDate: day('2026-09-05'), createdAt: day('2026-09-04') },
      { id: 'open-later', resolvedAt: null, dueDate: day('2026-10-05'), createdAt: day('2026-09-01') },
    ]
    expect(sortDefects(rows).map((r) => r.id)).toEqual(['open-late', 'open-later', 'open-no-day', 'done-new', 'done-old'])
  })
})

describe('canDeleteDefect', () => {
  const open = { reportedById: 'u1', resolvedAt: null }

  it('lets the office take any away', () => {
    expect(canDeleteDefect({ id: 'boss', role: 'MANAGER' }, open)).toBe(true)
    expect(canDeleteDefect({ id: 'boss', role: 'ADMIN' }, { ...open, resolvedAt: day('2026-09-02') })).toBe(true)
  })

  it('lets the crew take back its own report while it is open, and nothing else', () => {
    expect(canDeleteDefect({ id: 'u1', role: 'EMPLOYEE' }, open)).toBe(true)
    expect(canDeleteDefect({ id: 'u2', role: 'EMPLOYEE' }, open)).toBe(false)
    expect(canDeleteDefect({ id: 'u1', role: 'EMPLOYEE' }, { ...open, resolvedAt: day('2026-09-02') })).toBe(false)
  })
})

describe('defectRows', () => {
  it('puts a defect into words for the reader', () => {
    const record: DefectRecord = {
      id: 'd1',
      title: 'Riss in der Decke',
      description: null,
      location: 'Bad OG',
      dueDate: day('2026-09-20'),
      createdAt: day('2026-09-18'),
      resolvedAt: null,
      reportedById: 'u1',
      assignee: { firstName: 'Max', lastName: 'Muster' },
      reportedBy: { username: 'mmuster', employee: { firstName: 'Max', lastName: 'Muster' } },
      resolvedBy: null,
      photos: [{ id: 'f1', filename: 'decke.jpg' }],
    }
    const [row] = defectRows([record], { id: 'u2', role: 'EMPLOYEE' }, day('2026-09-21'), (d) => d.toISOString().slice(0, 10))
    expect(row).toEqual({
      id: 'd1',
      title: 'Riss in der Decke',
      description: null,
      location: 'Bad OG',
      due: { text: '2026-09-20', tone: 'late' },
      assignee: 'Max Muster',
      reported: 'Max Muster · 2026-09-18',
      resolved: null,
      photos: [{ id: 'f1', filename: 'decke.jpg' }],
      deletable: false,
    })
  })
})
