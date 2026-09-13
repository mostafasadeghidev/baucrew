import { describe, expect, it } from 'vitest'
import { dataGapReport, type GapProject } from '@/lib/data-gaps'

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

const job = (over: Partial<GapProject> & { id: string; status: string }): GapProject => ({
  number: `2041-${over.id}`,
  name: `Musterprojekt ${over.id}`,
  customer: 'Muster GmbH',
  amount: 10_000,
  plannedStart: d('2026-05-01'),
  isSub: false,
  historical: false,
  lines: [{ year: 2026, amount: 10_000, isSub: false }],
  ...over,
})

const opts = { sheetYears: [2025, 2026], currentYear: 2026, runningMonth: 8 }

describe('dataGapReport', () => {
  it('has nothing to say about a complete job', () => {
    const report = dataGapReport([job({ id: 'ok', status: 'APPROVED' })], [], opts)
    expect(report.count).toBe(0)
  })

  it('asks for a value from the offer on, and for a start date only from planned work on', () => {
    const report = dataGapReport(
      [
        job({ id: 'lead', status: 'LEAD', amount: null, plannedStart: null, lines: [] }),
        job({ id: 'offer', status: 'QUOTED', amount: null, plannedStart: null, lines: [] }),
        job({ id: 'order', status: 'APPROVED', amount: null, plannedStart: null, lines: [] }),
        job({ id: 'planned', status: 'PLANNED', amount: null, plannedStart: null, lines: [] }),
      ],
      [],
      opts
    )
    expect(report.valueOrDate.map((r) => [r.project.id, r.valueMissing, r.dateMissing])).toEqual([
      ['offer', true, false],
      ['order', true, false],
      ['planned', true, true],
    ])
  })

  it('names a job whose value and sheet lines disagree, and one whose SUB mark disagrees', () => {
    const report = dataGapReport(
      [
        job({ id: 'value', status: 'APPROVED', amount: 50_000, lines: [{ year: 2026, amount: 155_000, isSub: false }] }),
        job({ id: 'sub', status: 'IN_PROGRESS', lines: [{ year: 2026, amount: 10_000, isSub: true }] }),
      ],
      [],
      opts
    )
    expect(report.valueVsPlan).toEqual([expect.objectContaining({ planTotal: 155_000, difference: 105_000 })])
    expect(report.subConflict.map((p) => p.id)).toEqual(['sub'])
    expect(report.count).toBe(2)
  })

  it('names a job starting in a sheet year with no line in that year, but not in a year without a sheet', () => {
    const report = dataGapReport(
      [
        job({ id: 'missing', status: 'PLANNED', lines: [{ year: 2025, amount: 10_000, isSub: false }] }),
        job({ id: 'nosheet', status: 'PLANNED', plannedStart: d('2027-03-01'), lines: [] }),
      ],
      [],
      opts
    )
    expect(report.notInPlan).toEqual([expect.objectContaining({ year: 2026 })])
    expect(report.notInPlan[0].project.id).toBe('missing')
  })

  it('counts a job once however many gaps it has', () => {
    const report = dataGapReport(
      [job({ id: 'both', status: 'PLANNED', amount: null, plannedStart: null, isSub: true, lines: [{ year: 2026, amount: 5_000, isSub: false }] })],
      [],
      opts
    )
    expect(report.valueOrDate).toHaveLength(1)
    expect(report.subConflict).toHaveLength(1)
    expect(report.count).toBe(1)
  })

  it('does not ask about old data, and counts it instead', () => {
    const report = dataGapReport([job({ id: 'old', status: 'COMPLETED', amount: null, historical: true })], [], opts)
    expect(report.valueOrDate).toEqual([])
    expect(report.historicalWithGaps).toBe(1)
    expect(report.count).toBe(0)
  })

  it('keeps loose sheet lines from the running month on as work, and earlier ones as a record', () => {
    const report = dataGapReport(
      [],
      [
        { id: 'past', year: 2026, month: 3, name: 'Musterweg', amount: 20_000 },
        { id: 'now', year: 2026, month: 9, name: 'Beispielhof', amount: 30_000 },
        { id: 'open', year: 2026, month: null, name: 'Musterstraße', amount: 5_000 },
        { id: 'next', year: 2027, month: 1, name: 'Beispielgasse', amount: 7_000 },
        { id: 'closed', year: 2025, month: 11, name: 'Musterplatz', amount: 9_000 },
      ],
      opts
    )
    expect(report.looseLines.map((l) => l.id)).toEqual(['now', 'open', 'next'])
    expect(report.looseLinesPast).toEqual({ count: 1, total: 20_000 })
    expect(report.count).toBe(3)
  })
})
