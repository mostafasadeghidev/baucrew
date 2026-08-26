import { describe, expect, it } from 'vitest'
import { absenceCoversDay, absentEmployeesOn } from '@/lib/absences'
import { detectAbsenceConflicts, type ConflictEntry } from '@/lib/schedule-conflicts'
import { formatFileSize, safeFileName, storageKeyFor, validateUpload, MAX_FILE_SIZE } from '@/lib/files'

const d = (iso: string) => new Date(`${iso}T00:00:00Z`)

describe('absences', () => {
  const absence = { employeeId: 'e1', startDate: d('2026-08-10'), endDate: d('2026-08-14'), type: 'VACATION' }

  it('covers days inclusively', () => {
    expect(absenceCoversDay(absence, d('2026-08-10'))).toBe(true)
    expect(absenceCoversDay(absence, d('2026-08-14'))).toBe(true)
    expect(absenceCoversDay(absence, d('2026-08-09'))).toBe(false)
    expect(absenceCoversDay(absence, d('2026-08-15'))).toBe(false)
  })

  it('maps who is away on a day', () => {
    const away = absentEmployeesOn([absence], d('2026-08-12'))
    expect(away.get('e1')).toBe('VACATION')
    expect(absentEmployeesOn([absence], d('2026-08-20')).size).toBe(0)
  })

  it('turns a scheduled absent employee into one conflict with all entries', () => {
    const entries: ConflictEntry[] = [
      {
        id: 'a',
        date: d('2026-08-12'),
        vehicles: [],
        employees: [{ employee: { id: 'e1', firstName: 'Max', lastName: 'Muster' } }],
      },
      {
        id: 'b',
        date: d('2026-08-12'),
        vehicles: [],
        employees: [{ employee: { id: 'e1', firstName: 'Max', lastName: 'Muster' } }],
      },
      {
        id: 'c',
        date: d('2026-08-20'), // outside the absence
        vehicles: [],
        employees: [{ employee: { id: 'e1', firstName: 'Max', lastName: 'Muster' } }],
      },
    ]
    const conflicts = detectAbsenceConflicts(entries, [absence])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({ type: 'absence', name: 'Max Muster', absenceType: 'VACATION' })
    expect(conflicts[0].entryIds.sort()).toEqual(['a', 'b'])
  })
})

describe('file uploads', () => {
  it('validates size and type', () => {
    expect(validateUpload(0, 'application/pdf')).toBe('empty')
    expect(validateUpload(MAX_FILE_SIZE + 1, 'application/pdf')).toBe('tooLarge')
    expect(validateUpload(1000, 'application/x-msdownload')).toBe('badType')
    expect(validateUpload(1000, 'application/pdf')).toBeNull()
    expect(validateUpload(1000, 'image/jpeg')).toBeNull()
  })

  it('sanitises file names but keeps umlauts and the extension', () => {
    expect(safeFileName('Aufmaß Küche (EG).pdf')).toBe('Aufmaß Küche (EG).pdf')
    expect(safeFileName('..\\..\\evil<script>.pdf')).toBe('evil_script_.pdf')
    expect(safeFileName('/tmp/plan.pdf')).toBe('plan.pdf')
    expect(safeFileName('')).toBe('datei')
  })

  it('builds a per-project storage key', () => {
    expect(storageKeyFor('p1', 'u1', 'plan.pdf')).toBe('p1/u1-plan.pdf')
  })

  it('formats sizes', () => {
    expect(formatFileSize(500)).toBe('500 B')
    expect(formatFileSize(2048)).toBe('2 KB')
    expect(formatFileSize(3 * 1024 * 1024)).toBe('3.0 MB')
  })
})
