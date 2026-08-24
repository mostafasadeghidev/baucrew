import { describe, expect, it } from 'vitest'
import { planChecklistChanges } from '@/lib/project-checklists'

describe('project checklists', () => {
  it('adds what is newly selected', () => {
    const plan = planChecklistChanges([], ['t1', 't2', 't1'])
    expect(plan.add).toEqual(['t1', 't2'])
    expect(plan.remove).toEqual([])
    expect(plan.kept).toEqual([])
  })

  it('keeps what is already there', () => {
    const plan = planChecklistChanges(
      [{ id: 'c1', templateId: 't1', ticked: false }],
      ['t1', 't2']
    )
    expect(plan.add).toEqual(['t2'])
    expect(plan.remove).toEqual([])
  })

  it('removes an unselected list only while nothing is ticked', () => {
    const plan = planChecklistChanges(
      [
        { id: 'c1', templateId: 't1', ticked: false },
        { id: 'c2', templateId: 't2', ticked: true },
      ],
      []
    )
    expect(plan.remove).toEqual(['c1'])
    expect(plan.kept).toEqual(['c2'])
  })

  it('never touches a list written by hand on the project', () => {
    const plan = planChecklistChanges([{ id: 'c9', templateId: null, ticked: false }], [])
    expect(plan.remove).toEqual([])
    expect(plan.kept).toEqual([])
  })
})
