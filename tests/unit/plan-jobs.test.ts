import { describe, expect, it } from 'vitest'
import {
  candidateJobs,
  sameWord,
  groupPlanJobs,
  jobKey,
  jobSpan,
  matchProjectsToJobs,
  mergeJobs,
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

/** The day the tests run on: September 2026. */
const TODAY = new Date(Date.UTC(2026, 8, 6))

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

  it('carries a job over New Year when it simply goes on', () => {
    const jobs = groupPlanJobs([
      line({ id: 'a', name: 'Musterhof', year: 2025, month: 11, amount: 1 }),
      line({ id: 'b', name: 'Musterhof', year: 2025, month: 12, amount: 2 }),
      line({ id: 'c', name: 'Musterhof Rest', year: 2026, month: 1, amount: 4 }),
    ])
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({ year: 2025, endYear: 2026, months: [11, 12, 1], amount: 7 })
    expect(jobSpan(jobs[0]).end.toISOString().slice(0, 10)).toBe('2026-01-31')
  })

  it('does not carry it over a gap — a spring job is a job of its own', () => {
    const jobs = groupPlanJobs([
      line({ id: 'a', name: 'Musterhof', year: 2025, month: 11 }),
      line({ id: 'b', name: 'Musterhof', year: 2026, month: 3 }),
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

  it('merges several jobs into their whole span and amount', () => {
    const jobs = groupPlanJobs([
      line({ id: 'a', name: 'Musterhof Innenputz', year: 2025, month: 11, amount: 5 }),
      line({ id: 'b', name: 'Musterhof Maler', year: 2026, month: 3, amount: 7 }),
    ])
    const one = mergeJobs(jobs)
    expect(one).toMatchObject({ year: 2025, endYear: 2026, amount: 12, lineIds: ['a', 'b'] })
    expect(jobSpan(one).end.toISOString().slice(0, 10)).toBe('2026-03-31')
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
    const [m] = matchProjectsToJobs([project({ id: 'p1', name: 'Musterhof Anna Fassade' })], jobs, TODAY)
    expect(m.sure.map((j) => j.year)).toEqual([2026])
    expect(m.sure[0].lineIds).toEqual(['a'])
  })

  it('rules out a job from before the project existed', () => {
    // The card was created in 2026; the 2023 job cannot be it.
    const cands = candidateJobs(project({ id: 'p1', name: 'Musterhof Fassade' }), jobs, TODAY)
    expect(cands.map((j) => j.year)).toEqual([2026])
  })

  it('allows the following year, since work is planned ahead', () => {
    const cands = candidateJobs(
      project({ id: 'p1', name: 'Musterhof', sourceCreatedAt: new Date(Date.UTC(2025, 10, 1)) }),
      jobs,
      TODAY
    )
    expect(cands.map((j) => j.year)).toEqual([2026])
  })

  it('offers a choice instead of guessing when a name fits two jobs', () => {
    const two = groupPlanJobs([
      line({ id: 'd', name: 'Beispielhalle Nord', month: 7 }),
      line({ id: 'e', name: 'Beispielhalle Sued', month: 8 }),
    ])
    const [m] = matchProjectsToJobs([project({ id: 'p1', name: 'Beispielhalle Anstrich' })], two, TODAY)
    expect(m.sure).toEqual([])
    expect(m.candidates.map((j) => j.lineIds[0]).sort()).toEqual(['d', 'e'])
  })

  it('never carries a match on one common word', () => {
    const common = groupPlanJobs([
      line({ id: '1', name: 'Musterhof Nord' }),
      line({ id: '2', name: 'Musterhof Sued' }),
      line({ id: '3', name: 'Musterhof West' }),
      line({ id: '4', name: 'Musterhof Ost' }),
    ])
    const [m] = matchProjectsToJobs([project({ id: 'p1', name: 'Musterhof Anstrich' })], common, TODAY)
    expect(m.sure).toEqual([])
  })

  it('leaves a job open when two projects claim it equally', () => {
    const ms = matchProjectsToJobs(
      [
        project({ id: 'p1', name: 'Beispielweg 4' }),
        project({ id: 'p2', name: 'Beispielweg 4 Maler' }),
      ],
      jobs,
      TODAY
    )
    // Both fit "Beispielweg 4 Innenputz" the same; guessing would be a coin toss.
    expect(ms.every((m) => m.sure.length === 0)).toBe(true)
    expect(ms.every((m) => m.candidates.some((j) => j.lineIds[0] === 'b'))).toBe(true)
  })

  it('leaves a contested job open however well one side fits', () => {
    const ms = matchProjectsToJobs(
      [
        project({ id: 'p1', name: 'Beispielweg 4' }),
        project({ id: 'p2', name: 'Beispielweg 4 Innenputz' }),
      ],
      jobs,
      TODAY
    )
    // Telling those two apart is a second's work for a person; the code guesses.
    expect(ms.every((m) => m.sure.length === 0)).toBe(true)
  })

  it('prefers the job with more words in common over a bare surname', () => {
    const two = groupPlanJobs([
      line({ id: 'x', name: 'Musterhof Treppenhaus', month: 1 }),
      line({ id: 'y', name: 'Musterhof Fassade Mdorf', month: 3 }),
    ])
    const [m] = matchProjectsToJobs([project({ id: 'p1', name: 'Musterhof Musterdorf' })], two, TODAY)
    // "Mdorf" is how the office shortens Musterdorf, so that job shares two words.
    expect(m.sure[0]?.lineIds).toEqual(['y'])
  })

  it('prefers the job worded like the project when the site words tie', () => {
    const two = groupPlanJobs([
      line({ id: 'x', name: 'Musterhof Maler', year: 2025, month: 8 }),
      line({ id: 'y', name: 'Musterhof Restarbeiten', year: 2026, month: 8 }),
    ])
    const [m] = matchProjectsToJobs(
      [project({ id: 'p1', name: 'Musterhof Restarbeiten', sourceCreatedAt: new Date(Date.UTC(2025, 0, 1)) })],
      two,
      TODAY
    )
    expect(m.sure[0]?.lineIds).toEqual(['y'])
  })

  it('hands the job that is left to the project that is left', () => {
    const two = groupPlanJobs([
      line({ id: 'x', name: 'Musterhof Maler', year: 2025, month: 8 }),
      line({ id: 'y', name: 'Musterhof Restarbeiten', year: 2026, month: 8 }),
    ])
    const card = new Date(Date.UTC(2025, 0, 1))
    const ms = matchProjectsToJobs(
      [
        project({ id: 'p1', name: 'Musterhof Denkmal', sourceCreatedAt: card }),
        project({ id: 'p2', name: 'Musterhof Restarbeiten', sourceCreatedAt: card }),
      ],
      two,
      TODAY
    )
    // p2 is worded like the 2026 job and takes it; that leaves p1 one job.
    expect(ms.find((m) => m.projectId === 'p2')!.sure[0]?.lineIds).toEqual(['y'])
    expect(ms.find((m) => m.projectId === 'p1')!.sure[0]?.lineIds).toEqual(['x'])
  })

  it('reads a contracted place name as the town it stands for', () => {
    expect(sameWord('mbach', 'musterbach')).toBe(true)
    expect(sameWord('mdorf', 'musterdorf')).toBe(true)
    expect(sameWord('xbach', 'musterbach')).toBe(false)
    expect(sameWord('rest', 'restarbeiten')).toBe(false)
  })

  it('reads a street without its ending as the street', () => {
    expect(sameWord('muster', 'musterstrasse')).toBe(true)
    expect(sameWord('beispiel', 'beispielweg')).toBe(true)
    expect(sameWord('wag', 'musterhof')).toBe(false)
  })

  it('never lets a council carry a match on the name of its town', () => {
    const one = groupPlanJobs([line({ id: 'x', name: 'Musterhof Beispieldorf', month: 4 })])
    const [m] = matchProjectsToJobs(
      [project({ id: 'p1', name: 'Beispieldorf Anstrich', customer: 'Gemeinde Beispieldorf' })],
      one,
      TODAY
    )
    // A private job in the council's town: offered, since the town is shared, never sure.
    expect(m.sure).toEqual([])
    expect(m.candidates).toHaveLength(1)
  })

  it('is sure of a job named with the whole project name, word for word', () => {
    const two = groupPlanJobs([
      line({ id: 'x', name: 'Schule Beispieldorf Treppenhaus 2', month: 8 }),
      line({ id: 'y', name: 'Musterhof Beispieldorf', month: 4 }),
    ])
    const [m] = matchProjectsToJobs(
      [
        project({
          id: 'p1',
          name: 'Schule Beispieldorf Treppenhaus',
          customer: 'Schule Beispieldorf',
          sourceCreatedAt: null,
        }),
      ],
      two,
      TODAY
    )
    expect(m.sure[0]?.lineIds).toEqual(['x'])
  })

  it('keeps a hand-entered project within a year of when it was entered', () => {
    const old = groupPlanJobs([line({ id: 'o', name: 'Musterhof', year: 2024 })])
    const [m] = matchProjectsToJobs(
      [project({ id: 'p1', name: 'Musterhof', sourceCreatedAt: null })],
      old,
      TODAY
    )
    expect(m.candidates).toEqual([])
  })

  it('does not match two people who share a surname', () => {
    const two = groupPlanJobs([line({ id: 'x', name: 'Musterhof Udo Fassade' })])
    const [m] = matchProjectsToJobs([project({ id: 'p1', name: 'Musterhof Tino Wasserschaden' })], two, TODAY)
    // Tino is not Udo: not even offered.
    expect(m.sure).toEqual([])
    expect(m.candidates).toEqual([])
  })

  it('ignores first names, work words and institutions when matching', () => {
    expect(siteWords('Musterhof Thomas')).toEqual(['musterhof'])
    expect(siteWords('Gemeinde Schulkueche Anstrich')).toEqual([])
    expect(siteWords('Aussenfassade streichen')).toEqual([])
  })

  it('reads a name that is nothing but a first name as the surname it is', () => {
    expect(siteWords('Dieter Innenputz')).toEqual(['dieter'])
    const one = groupPlanJobs([line({ id: 'l', name: 'Dieter Maler Trockenbau', month: 2 })])
    const [m] = matchProjectsToJobs([project({ id: 'p1', name: 'Dieter Komplett Ausbau' })], one, TODAY)
    expect(m.sure[0]?.lineIds).toEqual(['l'])
  })

  it('uses the customer name too, since the sheet often carries only that', () => {
    const [m] = matchProjectsToJobs(
      [project({ id: 'p1', name: 'Innenausbau', customer: 'Beispielweg' })],
      jobs,
      TODAY
    )
    expect(m.sure[0]?.lineIds).toEqual(['b'])
  })

  it('holds a project with no source date to the year it was entered', () => {
    // Entered in 2026: the 2026 job fits, the 2023 one is somebody else's.
    const cands = candidateJobs(
      project({ id: 'p1', name: 'Musterhof Fassade', sourceCreatedAt: null }),
      jobs,
      TODAY
    )
    expect(cands.map((j) => j.year)).toEqual([2026])
  })

  it('reads a short form of a first name as the same person', () => {
    const one = groupPlanJobs([line({ id: 'f', name: 'Musterhof Flo Anbau' })])
    const [m] = matchProjectsToJobs([project({ id: 'p1', name: 'Musterhof Florian Anbau' })], one, TODAY)
    expect(m.sure[0]?.lineIds).toEqual(['f'])
  })
})

describe('lines without identifying words', () => {
  it('still become a job of their own, so a person can link them', () => {
    const jobs = groupPlanJobs([line({ id: 'k', name: 'Kindergarten XY', month: 4 })])
    expect(jobs).toHaveLength(1)
    expect(jobs[0].lineIds).toEqual(['k'])
  })
  it('never match anything on their own', () => {
    const jobs = groupPlanJobs([line({ id: 'k', name: 'Kindergarten XY', month: 4 })])
    const [m] = matchProjectsToJobs([project({ id: 'p1', name: 'Kindergarten XY' })], jobs, TODAY)
    expect(m.sure).toEqual([])
    expect(m.candidates).toEqual([])
  })
})

describe('what the dates rule out', () => {
  const two = groupPlanJobs([
    line({ id: 'a', name: 'Musterhof', year: 2025, month: 6 }),
    line({ id: 'b', name: 'Musterhof', year: 2026, month: 3 }),
  ])

  it('a job that was over months before the card existed', () => {
    const cands = candidateJobs(
      project({ id: 'p1', name: 'Musterhof', sourceCreatedAt: new Date(Date.UTC(2025, 10, 1)) }),
      two,
      TODAY
    )
    // The 2025 job ended in June; a card from November is a later job.
    expect(cands.map((j) => j.year)).toEqual([2026])
  })

  it('a job that has not started yet, for work that is finished', () => {
    const cands = candidateJobs(
      project({ id: 'p1', name: 'Musterhof', sourceCreatedAt: new Date(Date.UTC(2025, 3, 1)), done: true }),
      two,
      new Date(Date.UTC(2025, 11, 1))
    )
    // Seen from December 2025, the March 2026 job lies ahead: not finished work.
    expect(cands.map((j) => j.year)).toEqual([2025])
  })

  it('nothing else: finished work may well be last year\'s card', () => {
    const cands = candidateJobs(
      project({ id: 'p1', name: 'Musterhof', sourceCreatedAt: new Date(Date.UTC(2025, 3, 1)), done: true }),
      two,
      TODAY
    )
    expect(cands.map((j) => j.year)).toEqual([2025, 2026])
  })
})

describe('one customer, one project, several phases', () => {
  const phases = groupPlanJobs([
    line({ id: 'a', name: 'Musterhof Innenputz', year: 2025, month: 11, amount: 20000 }),
    line({ id: 'b', name: 'Musterhof Maler', year: 2026, month: 3, amount: 15000 }),
    line({ id: 'c', name: 'Musterhof Fassade', year: 2026, month: 4, amount: 20000 }),
  ])
  const card = new Date(Date.UTC(2025, 5, 1))

  it('go to the only project that could be doing them', () => {
    const [m] = matchProjectsToJobs(
      [project({ id: 'p1', name: 'Musterhof Innen und Aussenputz', sourceCreatedAt: card, done: true })],
      phases,
      TODAY
    )
    expect(m.sure.map((j) => j.lineIds)).toEqual([['a'], ['b', 'c']])
  })

  it('stay open when another project could be one of them', () => {
    const ms = matchProjectsToJobs(
      [
        project({ id: 'p1', name: 'Musterhof Innen und Aussenputz', sourceCreatedAt: card }),
        project({ id: 'p2', name: 'Musterhof Anbau', sourceCreatedAt: card }),
      ],
      phases,
      TODAY
    )
    expect(ms.every((m) => m.sure.length === 0)).toBe(true)
  })

  it('stay open when they lie far apart', () => {
    const apart = groupPlanJobs([
      line({ id: 'a', name: 'Musterhof Innenputz', year: 2025, month: 2 }),
      line({ id: 'b', name: 'Musterhof Maler', year: 2026, month: 5 }),
    ])
    const [m] = matchProjectsToJobs(
      [project({ id: 'p1', name: 'Musterhof Innen und Aussenputz', sourceCreatedAt: new Date(Date.UTC(2025, 0, 1)) })],
      apart,
      TODAY
    )
    expect(m.sure).toEqual([])
    expect(m.candidates).toHaveLength(2)
  })

  it('stay open for a council: its jobs are different buildings', () => {
    const buildings = groupPlanJobs([
      line({ id: 'a', name: 'Musterdorf Innenputz', year: 2025, month: 11 }),
      line({ id: 'b', name: 'Musterdorf Maler', year: 2026, month: 4 }),
    ])
    const [m] = matchProjectsToJobs(
      [
        project({
          id: 'p1',
          name: 'Musterdorf Anstrich',
          customer: 'Gemeinde Musterdorf',
          sourceCreatedAt: new Date(Date.UTC(2025, 5, 1)),
        }),
      ],
      buildings,
      TODAY
    )
    expect(m.sure).toEqual([])
    expect(m.candidates).toHaveLength(2)
  })

  it('are not two relatives with jobs a few months apart', () => {
    const two = groupPlanJobs([
      line({ id: 'a', name: 'Musterhof Margit', year: 2026, month: 6 }),
      line({ id: 'b', name: 'Musterhof Daniel', year: 2026, month: 9 }),
    ])
    const [m] = matchProjectsToJobs([project({ id: 'p1', name: 'Musterhof' })], two, TODAY)
    // A card without a first name fits either; taking both would be wrong for one.
    expect(m.sure).toEqual([])
    expect(m.candidates).toHaveLength(2)
  })

  it('carry a project that is linked already on to its next phase', () => {
    // Tied lines and free lines are folded apart, so these are two jobs.
    const [done] = groupPlanJobs([line({ id: 'a', name: 'Musterhof Innenputz', year: 2026, month: 2 })])
    const [next] = groupPlanJobs([line({ id: 'b', name: 'Musterhof Fassade', year: 2026, month: 3 })])
    const [m] = matchProjectsToJobs(
      [project({ id: 'p1', name: 'Musterhof Anna', linked: [done] })],
      [next],
      TODAY
    )
    // Only the new job is reported; the one it had is not news.
    expect(m.sure.map((j) => j.lineIds)).toEqual([['b']])
  })

  it('give a linked project the phase between two of its own, whoever else fits', () => {
    const had = groupPlanJobs([
      line({ id: 'a', name: 'Musterhof Anna Innenputz', year: 2026, month: 2 }),
      line({ id: 'd', name: 'Musterhof Anna Fassade Maler', year: 2026, month: 4 }),
    ])
    const [next, other] = groupPlanJobs([
      line({ id: 'b', name: 'Musterhof Fassade', year: 2026, month: 3 }),
      line({ id: 'c', name: 'Musterhof Udo Rest', year: 2026, month: 7 }),
    ])
    const ms = matchProjectsToJobs(
      [
        project({ id: 'p1', name: 'Musterhof Anna', linked: had }),
        project({ id: 'p2', name: 'Musterhof Udo' }),
      ],
      [next, other],
      TODAY
    )
    // March sits between Anna's February and April; Udo gets only his own.
    expect(ms.find((m) => m.projectId === 'p1')!.sure.map((j) => j.lineIds)).toEqual([['b']])
    expect(ms.find((m) => m.projectId === 'p2')!.sure.map((j) => j.lineIds)).toEqual([['c']])
  })

  it('leave a phase open that a namesake could be doing just as well', () => {
    const [done] = groupPlanJobs([line({ id: 'a', name: 'Musterhof Anna Innenputz', year: 2026, month: 2 })])
    const [next] = groupPlanJobs([line({ id: 'b', name: 'Musterhof Fassade', year: 2026, month: 3 })])
    const ms = matchProjectsToJobs(
      [
        project({ id: 'p1', name: 'Musterhof Anna', linked: [done] }),
        project({ id: 'p2', name: 'Musterhof Udo' }),
      ],
      [next],
      TODAY
    )
    expect(ms.every((m) => m.sure.length === 0)).toBe(true)
  })

  it('do not swallow a site of its own next door', () => {
    const jobs = groupPlanJobs([
      line({ id: 'a', name: 'Musterhof Innenputz', year: 2026, month: 3 }),
      line({ id: 'b', name: 'Musterhof Beispielweg', year: 2026, month: 4 }),
    ])
    const [m] = matchProjectsToJobs([project({ id: 'p1', name: 'Musterhof' })], jobs, TODAY)
    // "Beispielweg" is a word the project does not carry: offered, not taken.
    expect(m.sure.map((j) => j.lineIds)).toEqual([['a']])
    expect(m.candidates.map((j) => j.lineIds)).toEqual([['a'], ['b']])
  })
})
