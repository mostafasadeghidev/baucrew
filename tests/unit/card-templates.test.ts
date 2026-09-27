import { describe, expect, it } from 'vitest'
import { keptParts, templateParts, TEMPLATE_PARTS } from '@/lib/card-templates'

const none = { labels: 0, members: 0, checklists: 0, vehicles: 0, devices: 0, items: 0 }

describe('templateParts', () => {
  it('offers nothing for a template that is only a name', () => {
    expect(templateParts(none)).toEqual([])
  })

  it('offers what the template has, in the fixed order, with how many', () => {
    expect(templateParts({ ...none, items: 7, labels: 1, checklists: 2 })).toEqual([
      { part: 'labels', count: 1 },
      { part: 'checklists', count: 2 },
      { part: 'items', count: 7 },
    ])
  })

  it('offers every part of a full template', () => {
    const full = { labels: 1, members: 3, checklists: 2, vehicles: 1, devices: 2, items: 5 }
    expect(templateParts(full).map((p) => p.part)).toEqual([...TEMPLATE_PARTS])
  })
})

describe('keptParts', () => {
  it('keeps the ticked parts', () => {
    expect([...keptParts(['members', 'checklists'])].sort()).toEqual(['checklists', 'members'])
  })

  it('ignores what is not a part, and counts a part once', () => {
    expect([...keptParts(['items', 'items', 'price', '', null, 3, { part: 'labels' }])]).toEqual(['items'])
  })

  it('keeps nothing when nothing is ticked', () => {
    expect(keptParts([]).size).toBe(0)
  })
})
