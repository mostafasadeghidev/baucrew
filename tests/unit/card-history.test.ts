import { describe, expect, it } from 'vitest'
import { describeAudit, historyLines, type AuditEntry } from '@/lib/card-history'

const t = (key: string, values?: Record<string, string>) =>
  values ? `${key}(${Object.entries(values).map(([k, v]) => `${k}=${v}`).join(',')})` : key
const status = (s: string) => `[${s}]`
const entry = (action: string, rest: Partial<AuditEntry> = {}): AuditEntry => ({
  action,
  field: null,
  oldValue: null,
  newValue: null,
  createdAt: new Date(Date.UTC(2026, 8, 24)),
  user: { username: 'muster' },
  ...rest,
})

describe('what a card says happened to it', () => {
  it('names the statuses a move went between', () => {
    expect(describeAudit(entry('project.status', { oldValue: 'PLANNED', newValue: 'IN_PROGRESS' }), t, status)).toBe(
      'status(from=[PLANNED],to=[IN_PROGRESS])'
    )
    expect(describeAudit(entry('project.status.auto', { newValue: 'IN_PROGRESS' }), t, status)).toBe('statusAuto(from=—,to=[IN_PROGRESS])')
  })

  it('tells a rename from another change', () => {
    expect(describeAudit(entry('project.update', { field: 'name', newValue: 'Muster' }), t, status)).toBe('renamed(name=Muster)')
    expect(describeAudit(entry('project.update', { field: 'city' }), t, status)).toBe('updated')
  })

  it('has words for files, tasks, defects, forms and the archive', () => {
    expect(describeAudit(entry('project.file.add', { newValue: 'plan.pdf' }), t, status)).toBe('fileAdded(name=plan.pdf)')
    expect(describeAudit(entry('project.file.visibility', { field: 'plan.pdf', newValue: 'crew' }), t, status)).toBe('fileShown(name=plan.pdf)')
    expect(describeAudit(entry('project.task.done', { newValue: 'Gerüst' }), t, status)).toBe('taskDone(title=Gerüst)')
    expect(describeAudit(entry('project.defect.report', { newValue: 'Riss' }), t, status)).toBe('defectReported(title=Riss)')
    expect(describeAudit(entry('project.form.sign', { field: 'Abnahme' }), t, status)).toBe('formSigned(title=Abnahme)')
    expect(describeAudit(entry('project.archive'), t, status)).toBe('archived')
    expect(describeAudit(entry('project.invoice.ready', { field: 'invoice1' }), t, status)).toBe('invoiceReady(part=1)')
  })

  it('says nothing for what it has no words for, and keeps the order', () => {
    expect(describeAudit(entry('projectItem.status'), t, status)).toBeNull()
    const lines = historyLines([entry('projectItem.status'), entry('project.create', { user: null }), entry('project.archive')], t, status)
    expect(lines.map((l) => l.text)).toEqual(['created', 'archived'])
    expect(lines[0].who).toBeNull()
    expect(lines[1].who).toBe('muster')
  })
})
