import { describe, expect, it } from 'vitest'
import { siteTimeline, type TimelineJob } from '@/lib/site-timeline'

const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d))
const today = day(2026, 8, 25) // a Friday
const job = (id: string, over: Partial<TimelineJob> = {}): TimelineJob => ({
  id,
  number: `2026-${id}`,
  name: `Muster ${id}`,
  group: 'running',
  plannedStart: day(2026, 8, 21),
  plannedEnd: day(2026, 9, 2),
  ...over,
})

describe('siteTimeline', () => {
  it('places a site by its planned days inside a window of two weeks back and six ahead', () => {
    const { rows, todayLeft } = siteTimeline([job('a')], today)
    // The window starts 11.09.; the 21.09. is ten days in, of 56.
    expect(rows[0].left).toBe(round((10 / 56) * 100))
    // 21.09. through 02.10. inclusive: twelve days.
    expect(rows[0].width).toBe(round((12 / 56) * 100))
    expect(todayLeft).toBe(25)
  })

  it('runs a site without an end to today, clamps to the window, and never draws a bar thinner than it can be seen', () => {
    const { rows } = siteTimeline(
      [
        job('open', { plannedStart: day(2026, 7, 1), plannedEnd: null }),
        job('long', { plannedStart: day(2026, 8, 30), plannedEnd: day(2027, 0, 31) }),
        job('short', { plannedStart: day(2026, 8, 28), plannedEnd: day(2026, 8, 28) }),
      ],
      today
    )
    const open = rows.find((r) => r.id === 'open')!
    expect(open.left).toBe(0)
    expect(open.width).toBe(round((15 / 56) * 100))
    const long = rows.find((r) => r.id === 'long')!
    expect(round(long.left + long.width)).toBe(100)
    expect(rows.find((r) => r.id === 'short')!.width).toBe(round((1 / 56) * 100) < 1.5 ? 1.5 : round((1 / 56) * 100))
  })

  it('counts what it cannot draw: sites without a start, outside the window, or beyond the limit', () => {
    const many = Array.from({ length: 4 }, (_, i) => job(`m${i}`, { plannedStart: day(2026, 8, 20 + i) }))
    const t = siteTimeline(
      [...many, job('nodate', { plannedStart: null }), job('gone', { plannedStart: day(2026, 3, 1), plannedEnd: day(2026, 3, 30) })],
      today,
      { max: 3 }
    )
    expect(t.rows).toHaveLength(3)
    expect(t.undated).toBe(1)
    expect(t.more).toBe(2)
  })

  it('marks the Mondays with their calendar weeks, first to last', () => {
    const { weeks } = siteTimeline([], today)
    expect(weeks).toHaveLength(8)
    expect(weeks[0]).toEqual({ left: round((3 / 56) * 100), week: 38 })
    expect(weeks[weeks.length - 1].week).toBe(45)
  })
})

const round = (v: number) => Math.round(v * 100) / 100
