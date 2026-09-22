import { describe, expect, it } from 'vitest'
import { ageInDays, outcomeOf, pipelineColumns, yearFunnel } from '@/lib/pipeline'

const today = new Date(Date.UTC(2026, 8, 22))
const daysAgo = (n: number) => new Date(today.getTime() - n * 86_400_000)

const project = (number: string, status: string, since: Date, price: number | null = 1000) => ({
  id: number,
  number,
  name: `Muster ${number}`,
  customer: 'Muster GmbH',
  status,
  price,
  plannedStart: null,
  since,
})

describe('the pipeline columns', () => {
  it('are enquiry, offer and order, each counted and summed', () => {
    const columns = pipelineColumns(
      [
        project('2026-0001', 'LEAD', daysAgo(1), null),
        project('2026-0002', 'QUOTED', daysAgo(3), 2500),
        project('2026-0003', 'QUOTED', daysAgo(30), 4000),
        project('2026-0004', 'APPROVED', daysAgo(2), 800),
        project('2026-0005', 'PLANNED', daysAgo(2), 800),
        project('2026-0006', 'CANCELLED', daysAgo(2), 800),
      ],
      today
    )
    expect(columns.map((c) => c.stage)).toEqual(['LEAD', 'QUOTED', 'APPROVED'])
    expect(columns.map((c) => c.count)).toEqual([1, 2, 1])
    expect(columns.map((c) => c.sum)).toEqual([0, 6500, 800])
    expect(columns[0].unpriced).toBe(1)
  })

  it('put the longest-sitting project first and flag it once it has sat too long', () => {
    const [, offers] = pipelineColumns(
      [project('2026-0002', 'QUOTED', daysAgo(3)), project('2026-0003', 'QUOTED', daysAgo(30))],
      today
    )
    expect(offers.cards.map((c) => c.number)).toEqual(['2026-0003', '2026-0002'])
    expect(offers.cards.map((c) => c.stale)).toEqual([true, false])
    expect(offers.stale).toBe(1)
  })

  it('flag an enquiry after a week, an offer after three, an order after a month', () => {
    const columns = pipelineColumns(
      [
        project('2026-0001', 'LEAD', daysAgo(7)),
        project('2026-0002', 'QUOTED', daysAgo(20)),
        project('2026-0003', 'APPROVED', daysAgo(30)),
      ],
      today
    )
    expect(columns.map((c) => c.stale)).toEqual([1, 0, 1])
  })
})

describe('the age', () => {
  it('is whole days and never negative', () => {
    expect(ageInDays(daysAgo(2), today)).toBe(2)
    expect(ageInDays(new Date(today.getTime() + 86_400_000), today)).toBe(0)
  })
})

describe('the year', () => {
  it('reads won from every status past the offer, lost from cancelled, open from the rest', () => {
    expect(outcomeOf('LEAD')).toBe('open')
    expect(outcomeOf('QUOTED')).toBe('open')
    expect(outcomeOf('APPROVED')).toBe('won')
    expect(outcomeOf('PAID')).toBe('won')
    expect(outcomeOf('CANCELLED')).toBe('lost')
  })

  it('sums what was won and rates it against what was decided', () => {
    const funnel = yearFunnel([
      { status: 'LEAD', price: null },
      { status: 'QUOTED', price: 500 },
      { status: 'PAID', price: 3000 },
      { status: 'IN_PROGRESS', price: 1000 },
      { status: 'CANCELLED', price: 2000 },
    ])
    expect(funnel).toEqual({ total: 5, won: 2, lost: 1, open: 2, wonSum: 4000, winRate: 2 / 3 })
  })

  it('has no rate before anything is decided', () => {
    expect(yearFunnel([{ status: 'LEAD', price: null }]).winRate).toBeNull()
  })
})
