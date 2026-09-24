import { describe, expect, it } from 'vitest'
import { lineAmount, planLineFromProject, standInsToDrop } from '@/lib/plan-lines'

const job = {
  name: ' Muster Fassade ',
  plannedStart: new Date(Date.UTC(2026, 8, 14)),
  price: 3800,
  addOns: [{ amount: 200 }],
  isSub: false,
  lines: [],
}

describe('planLineFromProject', () => {
  it('makes the line of the month the job starts in, worth price and Nachträge', () => {
    expect(planLineFromProject(job)).toEqual({ line: { year: 2026, month: 9, name: 'Muster Fassade', amount: 4000, isSub: false } })
    expect(planLineFromProject({ ...job, isSub: true })).toMatchObject({ line: { isSub: true } })
  })

  it('refuses a job without a start, without a value, or with a line in that year already', () => {
    expect(planLineFromProject({ ...job, plannedStart: null })).toEqual({ error: 'noDate' })
    expect(planLineFromProject({ ...job, price: null, addOns: [] })).toEqual({ error: 'noValue' })
    expect(planLineFromProject({ ...job, lines: [{ year: 2026 }] })).toEqual({ error: 'hasLine' })
    expect(planLineFromProject({ ...job, lines: [{ year: 2025 }] })).toMatchObject({ line: { year: 2026 } })
  })

  it('takes the Nachträge alone when there is no price yet', () => {
    expect(lineAmount(null, [{ amount: 500 }])).toBe(500)
    expect(lineAmount(null, [])).toBeNull()
    expect(lineAmount(1000, [])).toBe(1000)
  })
})

describe('standInsToDrop', () => {
  it('drops a hand-made line once a sheet line of the same year is tied to its project', () => {
    const manual = [
      { id: 'a', year: 2026, projectId: 'p1' },
      { id: 'b', year: 2026, projectId: 'p2' },
      { id: 'c', year: 2027, projectId: 'p1' },
      { id: 'd', year: 2026, projectId: null },
    ]
    const sheet = [
      { year: 2026, projectId: 'p1' },
      { year: 2026, projectId: null },
    ]
    expect(standInsToDrop(manual, sheet)).toEqual(['a'])
    expect(standInsToDrop(manual, [])).toEqual([])
  })
})
