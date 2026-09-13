import { describe, expect, it } from 'vitest'
import {
  ALL_YEARS,
  belongsToYear,
  belongsToYears,
  parseProjectYears,
  projectYearOptions,
  projectYearSpan,
  projectYearsParam,
  toggleProjectYear,
  type YearProject,
} from '@/lib/project-years'

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

const project = (over: Partial<YearProject> = {}): YearProject => ({
  status: 'COMPLETED',
  plannedStart: null,
  plannedEnd: null,
  actualStart: null,
  actualEnd: null,
  sourceCreatedAt: null,
  createdAt: d('2026-03-01'),
  ...over,
})

describe('projectYearSpan', () => {
  it('runs from the earliest to the latest date, planned or actual', () => {
    expect(projectYearSpan(project({ plannedStart: d('2025-12-01'), plannedEnd: d('2025-12-20') }))).toEqual({
      from: 2025,
      to: 2025,
    })
    // Planned for December, actually finished in January: both years.
    expect(projectYearSpan(project({ plannedStart: d('2025-12-01'), actualEnd: d('2026-01-15') }))).toEqual({
      from: 2025,
      to: 2026,
    })
    // An end without a start still says when the work was.
    expect(projectYearSpan(project({ plannedEnd: d('2024-07-31') }))).toEqual({ from: 2024, to: 2024 })
  })

  it('files a project with no date under its card date, else the day it was typed in', () => {
    expect(projectYearSpan(project({ sourceCreatedAt: d('2025-05-05') }))).toEqual({ from: 2025, to: 2025 })
    expect(projectYearSpan(project())).toEqual({ from: 2026, to: 2026 })
  })
})

describe('belongsToYear', () => {
  const finished2025 = project({ plannedStart: d('2025-04-01'), plannedEnd: d('2025-05-01') })

  it('finds a finished project only in the years its work touches', () => {
    expect(belongsToYear(finished2025, 2025, 2026)).toBe(true)
    expect(belongsToYear(finished2025, 2026, 2026)).toBe(false)
    expect(belongsToYear(finished2025, 2024, 2026)).toBe(false)
  })

  it('keeps open work in the running year, whatever its dates', () => {
    const late = project({ status: 'IN_PROGRESS', plannedStart: d('2025-10-01'), plannedEnd: d('2025-11-30') })
    const nextSpring = project({ status: 'APPROVED', plannedStart: d('2027-04-01') })
    const undatedOffer = project({ status: 'QUOTED', sourceCreatedAt: d('2024-02-02') })
    for (const p of [late, nextSpring, undatedOffer]) expect(belongsToYear(p, 2026, 2026)).toBe(true)
    // ...and still under its own years, but not under a year it never touched.
    expect(belongsToYear(late, 2025, 2026)).toBe(true)
    expect(belongsToYear(nextSpring, 2027, 2026)).toBe(true)
    expect(belongsToYear(nextSpring, 2025, 2026)).toBe(false)
  })

  it('keeps a project in every year its status was changed in', () => {
    // Still open from last year, cancelled on this year's board: it stays where it was dropped.
    const cancelledToday = project({ status: 'CANCELLED', plannedStart: d('2025-06-01'), statusChangedYears: [2026] })
    expect(belongsToYear(cancelledToday, 2026, 2026)).toBe(true)
    expect(belongsToYear(cancelledToday, 2025, 2026)).toBe(true)
    expect(belongsToYear(cancelledToday, 2024, 2026)).toBe(false)
  })

  it('does not carry cancelled or finished work into the running year', () => {
    const cancelled = project({ status: 'CANCELLED', plannedStart: d('2025-06-01') })
    expect(belongsToYear(cancelled, 2026, 2026)).toBe(false)
    expect(belongsToYear(project({ status: 'PAID', actualEnd: d('2025-01-10') }), 2026, 2026)).toBe(false)
  })
})

describe('belongsToYears', () => {
  it('shows a project that belongs to any of the years ticked', () => {
    const in2024 = project({ plannedStart: d('2024-05-01') })
    expect(belongsToYears(in2024, [2026, 2025], 2026)).toBe(false)
    expect(belongsToYears(in2024, [2025, 2024], 2026)).toBe(true)
  })
})

describe('parseProjectYears', () => {
  it('opens on the running year, and reads one year, several or every year from the address', () => {
    expect(parseProjectYears(undefined, 2026)).toEqual([2026])
    expect(parseProjectYears('', 2026)).toEqual([2026])
    expect(parseProjectYears('2024', 2026)).toEqual([2024])
    expect(parseProjectYears('2025,2026', 2026)).toEqual([2026, 2025])
    expect(parseProjectYears(' 2024 , 2026,2024', 2026)).toEqual([2026, 2024])
    expect(parseProjectYears(ALL_YEARS, 2026)).toBe(ALL_YEARS)
  })

  it('leaves out what is not a year, and falls back to the running year when nothing is left', () => {
    expect(parseProjectYears('2025,abc,0999', 2026)).toEqual([2025])
    expect(parseProjectYears('20245', 2026)).toEqual([2026])
    expect(parseProjectYears('0000', 2026)).toEqual([2026])
    expect(parseProjectYears('abc,', 2026)).toEqual([2026])
  })

  it('reads a year repeated in the address as a list', () => {
    expect(parseProjectYears(['2025', '2026'], 2026)).toEqual([2026, 2025])
    expect(parseProjectYears(['abc'], 2026)).toEqual([2026])
  })
})

describe('projectYearsParam', () => {
  it('writes the running year alone as nothing, and anything else as a list', () => {
    expect(projectYearsParam([2026], 2026)).toBeNull()
    expect(projectYearsParam([2025], 2026)).toBe('2025')
    expect(projectYearsParam([2025, 2026], 2026)).toBe('2026,2025')
    expect(projectYearsParam(ALL_YEARS, 2026)).toBe(ALL_YEARS)
  })

  it('reads back what it writes', () => {
    for (const selection of [[2025], [2026, 2024], ALL_YEARS] as const) {
      const written = projectYearsParam(selection === ALL_YEARS ? ALL_YEARS : [...selection], 2026)
      expect(parseProjectYears(written ?? undefined, 2026)).toEqual(selection === ALL_YEARS ? ALL_YEARS : [...selection])
    }
  })
})

describe('toggleProjectYear', () => {
  it('adds and removes years, newest first', () => {
    expect(toggleProjectYear([2026], 2025)).toEqual([2026, 2025])
    expect(toggleProjectYear([2025], 2026)).toEqual([2026, 2025])
    expect(toggleProjectYear([2026, 2025], 2026)).toEqual([2025])
  })

  it('keeps the last year ticked', () => {
    expect(toggleProjectYear([2026], 2026)).toEqual([2026])
  })

  it('starts a fresh choice when a year is ticked from every year', () => {
    expect(toggleProjectYear(ALL_YEARS, 2024)).toEqual([2024])
  })
})

describe('projectYearOptions', () => {
  it('offers every year a project touches, newest first, and always the running year', () => {
    const projects = [
      project({ plannedStart: d('2024-11-01'), actualEnd: d('2025-02-01') }),
      project({ sourceCreatedAt: d('2023-03-03') }),
    ]
    expect(projectYearOptions(projects, 2026)).toEqual([2026, 2025, 2024, 2023])
  })

  it('offers a year in which only a status was changed', () => {
    expect(projectYearOptions([project({ sourceCreatedAt: d('2026-01-05'), statusChangedYears: [2027] })], 2026)).toEqual([
      2027, 2026,
    ])
  })

  it('keeps the years the page stands on, even with nothing in them', () => {
    expect(projectYearOptions([], 2026, [2019, 2018])).toEqual([2026, 2019, 2018])
  })

  it('does not let a mistyped date fill the list with a century of empty years', () => {
    const typo = project({ plannedStart: d('1926-05-01'), plannedEnd: d('2026-05-20') })
    const options = projectYearOptions([typo], 2026)
    expect(options[0]).toBe(2026)
    expect(options[options.length - 1]).toBe(2006)
    expect(options).toHaveLength(21)
  })
})
