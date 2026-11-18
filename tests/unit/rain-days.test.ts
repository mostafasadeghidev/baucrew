import { describe, expect, it } from 'vitest'
import { rainConfidence, rainDays, rainPlan, rainWindow, type RainProject } from '@/lib/rain-days'
import { utcDate } from '@/lib/dates'

// Monday, 2 November 2026
const today = utcDate('2026-11-02')

const outdoor = [{ workCategory: { outdoor: true } }]
const base: RainProject = {
  status: 'PLANNED',
  city: 'Musterstadt',
  latitude: 48.1,
  longitude: 11.5,
  plannedStart: null,
  plannedEnd: null,
  workCategories: outdoor,
  scheduleEntries: [],
}
const entries = (...days: string[]) => days.map((d) => ({ date: utcDate(d) }))

describe('rainWindow / rainConfidence', () => {
  it('covers two weeks, today included', () => {
    expect(rainWindow(today)).toEqual({ from: '2026-11-02', to: '2026-11-15' })
  })

  it('is firm for seven days, then a tendency, then nothing', () => {
    expect(rainConfidence('2026-11-01', today)).toBeNull()
    expect(rainConfidence('2026-11-02', today)).toBe('firm')
    expect(rainConfidence('2026-11-08', today)).toBe('firm')
    expect(rainConfidence('2026-11-09', today)).toBe('trend')
    expect(rainConfidence('2026-11-15', today)).toBe('trend')
    expect(rainConfidence('2026-11-16', today)).toBeNull()
  })
})

describe('rainPlan', () => {
  it('takes the schedule days inside the window', () => {
    const plan = rainPlan({ ...base, scheduleEntries: entries('2026-10-30', '2026-11-03', '2026-11-03', '2026-11-20') }, today)
    expect(plan).toEqual({ ok: true, days: ['2026-11-03'], source: 'schedule', outdoor: { by: 'trade' } })
  })

  it('lets schedule days win over the planned range', () => {
    const plan = rainPlan(
      { ...base, plannedStart: utcDate('2026-11-02'), plannedEnd: utcDate('2026-11-13'), scheduleEntries: entries('2026-11-05') },
      today
    )
    expect(plan).toEqual({ ok: true, days: ['2026-11-05'], source: 'schedule', outdoor: { by: 'trade' } })
  })

  it('falls back to the planned range, weekdays only, clipped to the window', () => {
    const plan = rainPlan(
      { ...base, plannedStart: utcDate('2026-10-28'), plannedEnd: utcDate('2026-11-10'), scheduleEntries: entries('2026-10-29') },
      today
    )
    expect(plan).toEqual({
      ok: true,
      days: ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10'],
      source: 'planned',
      outdoor: { by: 'trade' },
    })
  })

  it('reads a start without an end as one day', () => {
    expect(rainPlan({ ...base, plannedStart: utcDate('2026-11-12') }, today)).toEqual({ ok: true, days: ['2026-11-12'], source: 'planned', outdoor: { by: 'trade' } })
  })

  it('says why nothing is looked up', () => {
    expect(rainPlan({ ...base, status: 'COMPLETED' }, today)).toEqual({ ok: false, reason: 'closed' })
    expect(rainPlan({ ...base, doneAt: utcDate('2026-11-01') }, today)).toEqual({ ok: false, reason: 'closed' })
    expect(rainPlan({ ...base, archivedAt: utcDate('2026-11-01') }, today)).toEqual({ ok: false, reason: 'archived' })
    expect(rainPlan({ ...base, pausedAt: utcDate('2026-11-01') }, today)).toEqual({ ok: false, reason: 'paused' })
    expect(rainPlan({ ...base, workCategories: [{ workCategory: { outdoor: false } }] }, today)).toEqual({ ok: false, reason: 'notOutdoor' })
    expect(rainPlan({ ...base, city: ' ', latitude: null, longitude: null }, today)).toEqual({ ok: false, reason: 'noPlace' })
    expect(rainPlan(base, today)).toEqual({ ok: false, reason: 'noDates' })
    expect(rainPlan({ ...base, scheduleEntries: entries('2026-11-20') }, today)).toEqual({ ok: false, reason: 'outsideWindow' })
    expect(rainPlan({ ...base, plannedStart: utcDate('2026-11-07'), plannedEnd: utcDate('2026-11-08') }, today)).toEqual({
      ok: false,
      reason: 'outsideWindow',
    })
  })

  it('keeps a site with coordinates but no town name', () => {
    expect(rainPlan({ ...base, city: null, plannedStart: utcDate('2026-11-02') }, today).ok).toBe(true)
  })
})

describe('rainDays', () => {
  const forecast = new Map([
    ['2026-11-03', { probability: 80, amount: 6.5 }],
    ['2026-11-04', { probability: 59, amount: 1 }],
    ['2026-11-10', { probability: 60, amount: null }],
    ['2026-11-20', { probability: 95, amount: 12 }],
  ])

  it('keeps the days at or over the threshold, with their confidence', () => {
    expect(rainDays(['2026-11-10', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-20'], forecast, 60, today)).toEqual([
      { date: '2026-11-03', probability: 80, amount: 6.5, confidence: 'firm' },
      { date: '2026-11-10', probability: 60, amount: null, confidence: 'trend' },
    ])
  })

  it('follows the threshold', () => {
    expect(rainDays(['2026-11-03', '2026-11-04'], forecast, 50, today).map((d) => d.date)).toEqual(['2026-11-03', '2026-11-04'])
    expect(rainDays(['2026-11-03'], forecast, 90, today)).toEqual([])
  })
})

describe('rainPlan for plaster and paint on the facade', () => {
  const putz = [{ workCategory: { outdoor: false, nameDe: 'Putz', nameEn: 'Plaster' } }]
  const days = entries('2026-11-04')

  it('warns a Putz job whose description names the exterior plaster, and says why', () => {
    const plan = rainPlan({ ...base, workCategories: putz, description: 'BV: Außenputz Neubau', scheduleEntries: days }, today)
    expect(plan).toEqual({
      ok: true,
      days: ['2026-11-04'],
      source: 'schedule',
      outdoor: { by: 'text', field: 'description', word: 'Außenputz' },
    })
  })

  it('leaves the same job alone while nothing names the outside', () => {
    expect(rainPlan({ ...base, workCategories: putz, description: 'Innenputz EG', scheduleEntries: days }, today)).toEqual({
      ok: false,
      reason: 'notOutdoor',
    })
  })
})
