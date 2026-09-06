import { describe, expect, it } from 'vitest'
import {
  candidateJobs,
  sameWord,
  groupPlanJobs,
  jobKey,
  jobSpan,
  matchProjectsToJobs,
  siteWords,
  type JobProject,
  type PlanLine,
} from '@/lib/plan-jobs'

const line = (over: Partial<PlanLine> & { id: string; name: string }): PlanLine => ({
  year: 2026,
  month: 3,
  amount: 10000,
  isSub: false,
  ...over,
})

const project = (over: Partial<JobProject> & { id: string; name: string }): JobProject => ({
  // The customer is the first word of the name unless the test says otherwise.
  customer: over.name.split(/[\s,]+/)[0],
  sourceCreatedAt: new Date(Date.UTC(2026, 0, 15)),
  createdAt: new Date(Date.UTC(2026, 8, 1)),
  ...over,
})

describe('site words', () => {
  it('keeps what identifies a site and drops what describes the work', () => {
    expect(siteWords('Musterhof Fassade und Maler')).toEqual(['musterhof'])
    expect(siteWords('Beispielweg 4 Innenputz')).toEqual(['beispielweg'])
  })
  it('makes the same key for different spellings of one job', () => {
    expect(jobKey('Musterhof Innenausbau')).toBe(jobKey('Innenausbau Musterhof rest'))
  })
})

describe('grouping lines into jobs', () => {
  it('folds a job that runs over several months into one', () => {
    const jobs = groupPlanJobs([
      line({ id: 'a', name: 'Musterhof Innenausbau', month: 3, amount: 20000 }),
      line({ id: 'b', name: 'Musterhof Innenausbau', month: 4, amount: 15000 }),
      line({ id: 'c', name: 'Musterhof rest', month: 5, amount: 5000 }),
    ])
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({ months: [3, 4, 5], amount: 40000, lineIds: ['a', 'b', 'c'] })
  })

  it('keeps the same site in two years apart', () => {
    const jobs = groupPlanJobs([
      line({ id: 'a', name: 'Musterhof', year: 2025 }),
      line({ id: 'b', name: 'Musterhof', year: 2026 }),
    ])
    expect(jobs.map((j) => j.year)).toEqual([2025, 2026])
  })

  it('leaves out lines without a month', () => {
    const jobs = groupPlanJobs([
      line({ id: 'a', name: 'Musterhof', month: null }),
      line({ id: 'b', name: 'Musterhof', month: 2 }),
    ])
    expect(jobs.map((j) => j.lineIds)).toEqual([['b']])
  })

  it('spans from the first day of the first month to the last day of the last', () => {
    const [job] = groupPlanJobs([
      line({ id: 'a', name: 'Musterhof', month: 2 }),
      line({ id: 'b', name: 'Musterhof', month: 4 }),
    ])
    const span = jobSpan(job)
    expect(span.start.toISOString().slice(0, 10)).toBe('2026-02-01')
    expect(span.end.toISOString().slice(0, 10)).toBe('2026-04-30')
  })
})

describe('matching projects to jobs', () => {
  const jobs = groupPlanJobs([
    line({ id: 'a', name: 'Musterhof Fassade', year: 2026, month: 3 }),
    line({ id: 'b', name: 'Beispielweg 4 Innenputz', year: 2026, month: 5 }),
    line({ id: 'c', name: 'Musterhof Fassade', year: 2023, month: 6 }),
    line({ id: 'd', name: 'Schule Musterdorf', year: 2026, month: 7 }),
    line({ id: 'e', name: 'Schule Beispielstadt', year: 2026, month: 8 }),
  ])

  it('finds the one job a project belongs to', () => {
    const [m] = matchProjectsToJobs([project({ id: 'p1', name: 'Musterhof Anna Fassade' })], jobs)
    expect(m.sure?.year).toBe(2026)
    expect(m.sure?.lineIds).toEqual(['a'])
  })

  it('rules out a job from before the project existed', () => {
    // The card was created in 2026; the 2023 job cannot be it.
    const cands = candidateJobs(project({ id: 'p1', name: 'Musterhof Fassade' }), jobs)
    expect(cands.map((j) => j.year)).toEqual([2026])
  })

  it('allows the following year, since work is planned ahead', () => {
    const cands = candidateJobs(
      project({ id: 'p1', name: 'Musterhof', sourceCreatedAt: new Date(Date.UTC(2025, 10, 1)) }),
      jobs
    )
    expect(cands.map((j) => j.year)).toEqual([2026])
  })

  it('offers a choice instead of guessing when a name fits two jobs', () => {
    const two = groupPlanJobs([
      line({ id: 'd', name: 'Beispielhalle Nord', month: 7 }),
      line({ id: 'e', name: 'Beispielhalle Sued', month: 8 }),
    ])
    const [m] = matchProjectsToJobs([project({ id: 'p1', name: 'Beispielhalle Anstrich' })], two)
    expect(m.sure).toBeNull()
    expect(m.candidates.map((j) => j.lineIds[0]).sort()).toEqual(['d', 'e'])
  })

  it('never carries a match on one common word', () => {
    const common = groupPlanJobs([
      line({ id: '1', name: 'Musterhof Nord' }),
      line({ id: '2', name: 'Musterhof Sued' }),
      line({ id: '3', name: 'Musterhof West' }),
      line({ id: '4', name: 'Musterhof Ost' }),
    ])
    const [m] = matchProjectsToJobs([project({ id: 'p1', name: 'Musterhof Anstrich' })], common)
    expect(m.sure).toBeNull()
  })

  it('leaves a job open when two projects claim it equally', () => {
    const ms = matchProjectsToJobs(
      [
        project({ id: 'p1', name: 'Beispielweg 4' }),
        project({ id: 'p2', name: 'Beispielweg 4 Maler' }),
      ],
      jobs
    )
    // Both fit "Beispielweg 4 Innenputz" the same; guessing would be a coin toss.
    expect(ms.every((m) => m.sure === null)).toBe(true)
    expect(ms.every((m) => m.candidates.some((j) => j.lineIds[0] === 'b'))).toBe(true)
  })

  it('leaves a contested job open however well one side fits', () => {
    const ms = matchProjectsToJobs(
      [
        project({ id: 'p1', name: 'Beispielweg 4' }),
        project({ id: 'p2', name: 'Beispielweg 4 Innenputz' }),
      ],
      jobs
    )
    // Telling those two apart is a second's work for a person; the code guesses.
    expect(ms.every((m) => m.sure === null)).toBe(true)
  })

  it('prefers the job with more words in common over a bare surname', () => {
    const two = groupPlanJobs([
      line({ id: 'x', name: 'Musterhof Treppenhaus', month: 1 }),
      line({ id: 'y', name: 'Musterhof Fassade Mdorf', month: 3 }),
    ])
    const [m] = matchProjectsToJobs([project({ id: 'p1', name: 'Musterhof Musterdorf' })], two)
    // "Mdorf" is how the office shortens Musterdorf, so that job shares two words.
    expect(m.sure?.lineIds).toEqual(['y'])
  })

  it('reads a contracted place name as the town it stands for', () => {
    expect(sameWord('mbach', 'musterbach')).toBe(true)
    expect(sameWord('mdorf', 'musterdorf')).toBe(true)
    expect(sameWord('hbach', 'musterbach')).toBe(false)
    expect(sameWord('rest', 'restarbeiten')).toBe(false)
  })

  it('keeps a hand-entered project within a year of when it was entered', () => {
    const old = groupPlanJobs([line({ id: 'o', name: 'Musterhof', year: 2024 })])
    const [m] = matchProjectsToJobs(
      [project({ id: 'p1', name: 'Musterhof', sourceCreatedAt: null })],
      old
    )
    expect(m.candidates).toEqual([])
  })

  it('does not match two people who share a surname', () => {
    const two = groupPlanJobs([line({ id: 'x', name: 'Musterhof Udo Fassade' })])
    const [m] = matchProjectsToJobs([project({ id: 'p1', name: 'Musterhof Tino Wasserschaden' })], two)
    // Tino is not Udo: not even offered.
    expect(m.sure).toBeNull()
    expect(m.candidates).toEqual([])
  })

  it('ignores first names, work words and institutions when matching', () => {
    expect(siteWords('Musterhof Thomas')).toEqual(['musterhof'])
    expect(siteWords('Gemeinde Schulkueche Anstrich')).toEqual([])
    expect(siteWords('Aussenfassade streichen')).toEqual([])
  })

  it('uses the customer name too, since the sheet often carries only that', () => {
    const [m] = matchProjectsToJobs(
      [project({ id: 'p1', name: 'Innenausbau', customer: 'Beispielweg' })],
      jobs
    )
    expect(m.sure?.lineIds).toEqual(['b'])
  })

  it('holds a project with no source date to the year it was entered', () => {
    // Entered in 2026: the 2026 job fits, the 2023 one is somebody else's.
    const cands = candidateJobs(
      project({ id: 'p1', name: 'Musterhof Fassade', sourceCreatedAt: null }),
      jobs
    )
    expect(cands.map((j) => j.year)).toEqual([2026])
  })

  it('reads a short form of a first name as the same person', () => {
    const one = groupPlanJobs([line({ id: 'f', name: 'Musterhof Flo Anbau' })])
    const [m] = matchProjectsToJobs([project({ id: 'p1', name: 'Musterhof Florian Anbau' })], one)
    expect(m.sure?.lineIds).toEqual(['f'])
  })
})

describe('lines without identifying words', () => {
  it('still become a job of their own, so a person can link them', () => {
    const jobs = groupPlanJobs([line({ id: 'k', name: 'Kindergarten FO', month: 4 })])
    expect(jobs).toHaveLength(1)
    expect(jobs[0].lineIds).toEqual(['k'])
  })
  it('never match anything on their own', () => {
    const jobs = groupPlanJobs([line({ id: 'k', name: 'Kindergarten FO', month: 4 })])
    const [m] = matchProjectsToJobs([project({ id: 'p1', name: 'Kindergarten FO' })], jobs)
    expect(m.sure).toBeNull()
    expect(m.candidates).toEqual([])
  })
})
