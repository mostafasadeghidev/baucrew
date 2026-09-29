import { describe, expect, it } from 'vitest'
import { mergedFields, type MergeFields } from '@/lib/project-merge'

const empty: MergeFields = {
  externalSystem: null,
  externalId: null,
  externalUrl: null,
  sourceCreatedAt: null,
  clientType: null,
  buildingType: null,
  priority: null,
  leadSource: null,
  street: null,
  postalCode: null,
  city: null,
  latitude: null,
  longitude: null,
  phone: null,
  contact: null,
  isSub: false,
  plannedStart: null,
  plannedEnd: null,
  planMonth: null,
  planMonths: 1,
  dueDate: null,
  dueTime: null,
  dueReminder: null,
  actualStart: null,
  actualEnd: null,
  inspectionDate: null,
  executionWish: null,
  managerId: null,
  coverDocumentId: null,
  description: null,
  internalNotes: null,
}
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

describe('two records of one job folded into one', () => {
  it('takes the address with its place whole, from the kept record when it has one', () => {
    const keep = { ...empty, city: 'Musterstadt' }
    const drop = { ...empty, street: 'Beispielweg 2', postalCode: '12345', city: 'Beispielheim', latitude: 50.1, longitude: 8.6 }
    const merged = mergedFields(keep, drop, '2026-0001 Muster')
    expect([merged.street, merged.postalCode, merged.city, merged.latitude, merged.longitude]).toEqual([null, null, 'Musterstadt', null, null])
  })

  it('takes the dropped record’s address whole when the kept one has none', () => {
    const drop = { ...empty, street: 'Beispielweg 2', postalCode: '12345', city: 'Beispielheim', latitude: 50.1, longitude: 8.6 }
    const merged = mergedFields({ ...empty, phone: '0123' }, drop, 'x')
    expect([merged.street, merged.city, merged.latitude, merged.phone]).toEqual(['Beispielweg 2', 'Beispielheim', 50.1, '0123'])
  })

  it('keeps the due day with its hour and reminder, and the rough month with its length', () => {
    const keep = { ...empty, dueTime: '09:00' }
    const drop = { ...empty, dueDate: day('2026-10-02'), dueTime: '14:00', dueReminder: 60, planMonth: day('2026-11-01'), planMonths: 2 }
    const merged = mergedFields(keep, drop, 'x')
    expect([merged.dueDate, merged.dueTime, merged.dueReminder]).toEqual([day('2026-10-02'), '14:00', 60])
    expect([merged.planMonth, merged.planMonths]).toEqual([day('2026-11-01'), 2])
  })

  it('does not take a rough month over a fixed start, and fills the wish and the site visit', () => {
    const keep = { ...empty, plannedStart: day('2026-10-05') }
    const drop = { ...empty, planMonth: day('2026-12-01'), planMonths: 3, executionWish: 'Frühjahr', inspectionDate: day('2026-09-30') }
    const merged = mergedFields(keep, drop, 'x')
    expect([merged.plannedStart, merged.planMonth, merged.planMonths]).toEqual([day('2026-10-05'), null, 1])
    expect([merged.executionWish, merged.inspectionDate]).toEqual(['Frühjahr', day('2026-09-30')])
  })

  it('adds the dropped description under the kept one, naming where it came from', () => {
    const merged = mergedFields({ ...empty, description: 'A' }, { ...empty, description: 'B' }, '2026-0002 Beispiel')
    expect(merged.description).toBe('A\n\n--- 2026-0002 Beispiel ---\nB')
  })
})
