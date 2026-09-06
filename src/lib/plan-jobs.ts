// Stitching the planning sheet and the projects together.
//
// The sheet has one line per site and month; a job that runs from March to
// May is three lines. The projects (from the board) have one row per job. So
// the lines are first folded into JOBS — same site, the months it spans, over
// New Year if it keeps going — and a project is then matched against jobs,
// not lines.
//
// Names are never spelled the same way twice, so matching works on the words
// that identify a site and ignores the words that describe the work, first
// names, and words like "Gemeinde" that name a kind of customer. A match
// counts as sure only when it is the one job that fits firmly and nobody
// else lays the same claim to it; everything else is offered as a choice,
// never applied.

import { tokenize } from './plan-match'

export type PlanLine = {
  id: string
  year: number
  /** 1-12; lines without a month cannot belong to a job. */
  month: number | null
  name: string
  amount: number
  isSub: boolean
}

export type PlanJob = {
  /** Grouping words (site and first name), sorted and joined. */
  key: string
  /** Year of the first month. */
  year: number
  /** Year of the last month: the next year when the job runs over New Year. */
  endYear: number
  /** 1-12 in order; where a month is lower than the one before, the year turned. */
  months: number[]
  /** Sum of the lines: what the sheet plans for this job. */
  amount: number
  isSub: boolean
  lineIds: string[]
  /** The spellings the sheet used, for display. */
  names: string[]
}

export type JobProject = {
  id: string
  name: string
  customer: string
  /** When the source record was created — a board card's own date. */
  sourceCreatedAt: Date | null
  /** When the project was entered here; the fallback when there is no source date. */
  createdAt: Date
  /** True once the work is finished (completed, invoiced, paid). */
  done?: boolean
  /**
   * Jobs already tied to the project. Such a project claims nothing new on
   * its own, but it takes the phase next to what it has, and it keeps
   * another project from taking that phase.
   */
  linked?: PlanJob[]
}

export type JobMatch = {
  projectId: string
  /** The jobs the project surely belongs to — usually one; empty when unsure. */
  sure: PlanJob[]
  /** Ranked alternatives when it is not sure (empty when nothing fits). */
  candidates: PlanJob[]
}

/** Words that describe the work, not the site — they match everywhere. */
const TRADE_WORDS = new Set([
  'fassade', 'fassaden', 'aussenfassade', 'innenfassade', 'fassadenanstrich',
  'maler', 'malerarbeiten', 'anstrich', 'streichen', 'lackieren', 'spachtel',
  'spachteln', 'verputzen', 'innen', 'aussen', 'innenausbau', 'innenputz',
  'aussenputz', 'putz', 'estrich', 'trockenbau', 'wdvs', 'geruest', 'rest',
  'restarbeiten', 'wasserschaden', 'brandschaden', 'treppenhaus', 'treppenhaeuser',
  'bad', 'baeder', 'badumbau', 'flur', 'kueche', 'schulkueche', 'decke', 'wohnung',
  'haus', 'neubau', 'altbau', 'sanierung', 'dach', 'dachgeschoss', 'garage',
  'garagenbeschichtung', 'keller', 'boden', 'fenster', 'tueren', 'tuer', 'gauben',
  'sockel', 'sockelausbesserung', 'balkon', 'balkone', 'balkonanlage',
  'wohnzimmer', 'schlafzimmer', 'esszimmer', 'zimmer', 'ausbau', 'komplett',
  'anbau', 'umbau', 'holzfenster', 'holz', 'beschichtung', 'privat', 'einputzen',
  'tore', 'beplanken', 'strasse', 'str', 'hauptstrasse', 'weg', 'platz', 'gasse',
  'ring', 'und', 'der', 'die', 'das', 'fuer', 'von', 'am', 'ab',
  'im', 'in', 'mit', 'bei', 'noch', 'start', 'ende', 'neu', 'alt', 'teil',
  'geplant', 'rechts', 'links', 'vorne', 'hinten', 'oben', 'unten', 'nach',
])

/**
 * First names. The office writes "Nachname Vorname", so a first name shared
 * by two different people must never be what ties a project to a job. They
 * do still tell two jobs apart ("Musterhof Margit" is not "Musterhof Daniel").
 */
const FIRST_NAMES = new Set([
  'alexander', 'andrea', 'andreas', 'anna', 'anja', 'armin', 'bernd', 'birgit',
  'carsten', 'christian', 'christine', 'christoph', 'claudia', 'daniel',
  'daniela', 'david', 'dieter', 'dirk', 'edmund', 'elke', 'eva', 'fabian',
  'felix', 'florian', 'flo', 'frank', 'franz', 'gabi', 'georg', 'gerhard',
  'guenther', 'gunther', 'hans', 'heike', 'heinz', 'helmut', 'herbert', 'horst',
  'ines', 'jan', 'jens', 'jochen', 'johann', 'johannes', 'josef', 'juergen',
  'julia', 'jule', 'karin', 'karl', 'katharina', 'kathrin', 'klaus', 'lisa',
  'lorenz', 'ludwig', 'lukas', 'manfred', 'manuel', 'margit', 'maria', 'mario',
  'markus', 'martin', 'martina', 'matthias', 'max', 'michael', 'monika', 'nadine',
  'nicole', 'norbert', 'patrick', 'paul', 'peter', 'petra', 'philipp', 'rainer',
  'ralf', 'rene', 'robert', 'rolf', 'sabine', 'sandra', 'sarah',
  'sebastian', 'simon', 'stefan', 'stefanie', 'steffi', 'stephan', 'susanne',
  'sven', 'tanja', 'thomas', 'tim', 'tino', 'tobias', 'tobi', 'udo', 'ulrich',
  'ursula', 'uwe', 'walter', 'werner', 'wolfgang',
])

/** Institutions: they name a kind of customer, never one in particular. */
const INSTITUTION_WORDS = new Set([
  'gemeinde', 'markt', 'stadt', 'bauamt', 'landkreis', 'kreis', 'schule',
  'kindergarten', 'kiga', 'kita', 'feuerwehr', 'ffw', 'mensa', 'kirche',
  'rathaus', 'bank', 'hausverwaltung', 'architekt', 'architekten', 'arch',
  'bauvorhaben', 'metallbau', 'gmbh', 'kg', 'fahrschule', 'immo', 'immobilien',
])

/** Words that tell one job from another: 3+ letters, no numbers, no work words. */
export function groupingWords(name: string): string[] {
  return tokenize(name).filter(
    (t) => t.length >= 3 && !/^\d+$/.test(t) && !TRADE_WORDS.has(t) && !INSTITUTION_WORDS.has(t)
  )
}

/**
 * The words that identify a site for matching: grouping words minus first
 * names. A name that is nothing but first names is a surname that happens to
 * be one too ("Dieter Innenputz"), so those stay.
 */
export function siteWords(name: string): string[] {
  const words = groupingWords(name)
  const site = words.filter((t) => !FIRST_NAMES.has(t))
  return site.length ? site : words
}

/** A customer that is a body, not a person or a firm: a council, a school. */
const isInstitution = (customer: string) =>
  tokenize(customer).some((t) => INSTITUTION_WORDS.has(t))

/**
 * The grouping key. A line made only of words that identify nothing on their
 * own ("Kindergarten XY") still needs a key of its own, or it could never be
 * shown and linked by hand; the raw words serve, they just never match.
 */
export function jobKey(name: string): string {
  const words = groupingWords(name)
  const base = words.length ? words : tokenize(name)
  return [...new Set(base)].sort().join(' ')
}

/** Months counted from year 0, so two dates compare and subtract as numbers. */
const monthIndex = (year: number, month: number) => year * 12 + month
const jobStart = (job: PlanJob) => monthIndex(job.year, job.months[0])
const jobEnd = (job: PlanJob) => monthIndex(job.endYear, job.months[job.months.length - 1])

/**
 * Folds the sheet's lines into jobs. Lines with the same grouping words in
 * the same year are one job, whatever month they sit in; the amounts add up.
 * A job that is still going in November or December and picks up again in
 * January or February is one job across the two sheets, not two.
 */
export function groupPlanJobs(lines: PlanLine[]): PlanJob[] {
  const jobs = new Map<string, PlanJob>()
  for (const line of lines) {
    if (line.month === null) continue
    const key = jobKey(line.name)
    if (!key) continue
    const id = `${line.year}|${key}`
    const job = jobs.get(id) ?? {
      key,
      year: line.year,
      endYear: line.year,
      months: [],
      amount: 0,
      isSub: line.isSub,
      lineIds: [],
      names: [],
    }
    if (!job.months.includes(line.month)) job.months.push(line.month)
    job.amount += line.amount
    job.lineIds.push(line.id)
    if (!job.names.includes(line.name)) job.names.push(line.name)
    jobs.set(id, job)
  }
  for (const job of jobs.values()) job.months.sort((a, b) => a - b)

  // Over New Year: the earlier year's job takes the next year's lines.
  const years = [...new Set([...jobs.values()].map((j) => j.year))].sort((a, b) => a - b)
  for (const year of years) {
    for (const job of jobs.values()) {
      if (job.endYear !== year || job.months[job.months.length - 1] < 11) continue
      const next = jobs.get(`${year + 1}|${job.key}`)
      if (!next || next.months[0] > 2) continue
      job.endYear = year + 1
      job.months.push(...next.months)
      job.amount += next.amount
      job.lineIds.push(...next.lineIds)
      for (const n of next.names) if (!job.names.includes(n)) job.names.push(n)
      jobs.delete(`${year + 1}|${job.key}`)
    }
  }
  return [...jobs.values()]
}

/** Several jobs as one: the whole span, the whole amount, every line. */
export function mergeJobs(jobs: PlanJob[]): PlanJob {
  const sorted = [...jobs].sort((a, b) => jobStart(a) - jobStart(b))
  const first = sorted[0]
  const last = sorted.reduce((l, j) => (jobEnd(j) > jobEnd(l) ? j : l), first)
  return {
    key: first.key,
    year: first.year,
    endYear: last.endYear,
    months: sorted.flatMap((j) => j.months),
    amount: sorted.reduce((s, j) => s + j.amount, 0),
    isSub: sorted.every((j) => j.isSub),
    lineIds: sorted.flatMap((j) => j.lineIds),
    names: [...new Set(sorted.flatMap((j) => j.names))],
  }
}

/** The matching words of a job: its key without first names — unless that is all it has. */
const jobSiteWords = (job: PlanJob) => {
  const words = job.key.split(' ')
  const site = words.filter((w) => !FIRST_NAMES.has(w))
  return site.length ? site : words
}

/** The first names a name carries — "Flo" and "Florian" count as one. */
const firstNamesIn = (text: string) =>
  tokenize(text).filter((t) => FIRST_NAMES.has(t)).map((t) => t.slice(0, 3))

/**
 * Two people who share a surname are still two people. When both sides name
 * a first name and none of them agree, the match is off the table.
 */
function firstNamesClash(project: JobProject, job: PlanJob): boolean {
  const mine = firstNamesIn(`${project.name} ${project.customer}`)
  const theirs = firstNamesIn(job.names.join(' '))
  if (mine.length === 0 || theirs.length === 0) return false
  return !mine.some((m) => theirs.includes(m))
}

/** How many jobs a word appears in — a word in many jobs proves little. */
function wordFrequency(jobs: PlanJob[]): Map<string, number> {
  const freq = new Map<string, number>()
  for (const job of jobs) for (const w of jobSiteWords(job)) freq.set(w, (freq.get(w) ?? 0) + 1)
  return freq
}

/**
 * A word is telling when few of the jobs a project could be carry it. Six
 * allows a customer with a job every year or a site done in phases; a common
 * surname across a dozen jobs still proves nothing.
 */
const RARE_AT_MOST = 6

/** A job that was over this long before its card existed is somebody else's. */
const CARD_LAG_MONTHS = 2

/** Jobs of one customer this close together are phases of one project. */
const PHASE_GAP_MONTHS = 4

/**
 * Whether a job could be this project at all, going by dates. Work is planned
 * ahead, not behind: a card is made before or during its job, at most the year
 * before; a card made long after the job was over belongs to a later job. And
 * finished work lies behind us — a job that has not started yet is not it.
 */
function dateFits(job: PlanJob, project: JobProject, today: Date): boolean {
  const now = monthIndex(today.getUTCFullYear(), today.getUTCMonth() + 1)
  if (project.done && jobStart(job) > now) return false
  if (project.sourceCreatedAt) {
    const y = project.sourceCreatedAt.getUTCFullYear()
    const card = monthIndex(y, project.sourceCreatedAt.getUTCMonth() + 1)
    return jobEnd(job) >= card - CARD_LAG_MONTHS && job.year <= y + 1
  }
  // Entered by hand: the work may have started the year before it was typed
  // in, but a job from two years back is somebody else's.
  const y = project.createdAt.getUTCFullYear()
  return job.year === y || job.year === y - 1
}

/**
 * The office shortens place names to their first letter and their ending:
 * "Mbach" for a town ending in "-bach", "Mdorf" for one ending in "-dorf".
 * Streets lose their ending instead: "Muster" for Musterstraße. Two words
 * are the same when one is such a contraction of the other.
 */
const PLACE_ENDINGS = ['bach', 'dorf', 'berg', 'burg', 'heim', 'stadt', 'hausen', 'feld']
const STREET_ENDINGS = ['strasse', 'str', 'weg', 'platz', 'gasse']
export function sameWord(a: string, b: string): boolean {
  if (a === b) return true
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  if (short.length >= 3 && STREET_ENDINGS.some((e) => long === short + e)) return true
  if (short.length > 6 || long.length < 7 || short[0] !== long[0]) return false
  const tail = short.slice(1)
  return PLACE_ENDINGS.includes(tail) && long.endsWith(tail)
}

type Scored = { job: PlanJob; shared: number; overlap: number; firm: boolean }

/**
 * How a project relates to one job. `firm` is the bar for a sure match.
 * When both sides carry two or more identifying words they must share two:
 * two people with one surname, or one company at two streets, share a word
 * and are still not the same job. When either side is a single word, that
 * word must be the project's customer — "Musterhof" against a line reading
 * "Musterhof" is the whole name; a town both happen to mention is not. A
 * council's name IS a town, so it never carries a match on its own: the
 * council's job and a private job in the same town share that word. And a
 * job named with the project's whole name, word for word, is firm whatever
 * the words are: "Schule Musterdorf Treppenhaus" is in "Schule Musterdorf
 * Treppenhaus 2" and nowhere else.
 */
function score(project: JobProject, job: PlanJob, freq: Map<string, number>): Scored | null {
  const words = new Set(siteWords(`${project.name} ${project.customer}`))
  if (words.size === 0) return null
  const jobWords = jobSiteWords(job)
  if (jobWords.length === 0) return null
  const shared = jobWords.filter((w) => words.has(w) || [...words].some((p) => sameWord(p, w)))
  if (shared.length === 0) return null
  if (firstNamesClash(project, job)) return null
  // Work words and first names do not identify a site, but they rank two
  // candidates that share the same surname.
  const all = new Set(tokenize(`${project.name} ${project.customer}`))
  const overlap = job.names.reduce(
    (best, n) => Math.max(best, tokenize(n).filter((t) => all.has(t)).length),
    0
  )
  let firm: boolean
  if (words.size >= 2 && jobWords.length >= 2) {
    firm = shared.length >= 2
  } else {
    const customerWord = isInstitution(project.customer) ? undefined : siteWords(project.customer)[0]
    firm =
      customerWord !== undefined &&
      shared.some((w) => sameWord(w, customerWord)) &&
      (freq.get(customerWord) ?? 0) <= RARE_AT_MOST
  }
  const name = tokenize(project.name)
  if (!firm && name.length >= 2) {
    firm = job.names.some((n) => {
      const theirs = new Set(tokenize(n))
      return name.every((t) => theirs.has(t))
    })
  }
  return { job, shared: shared.length, overlap, firm }
}

const byStrength = (a: Scored, b: Scored) =>
  b.shared - a.shared || b.overlap - a.overlap || jobStart(a.job) - jobStart(b.job)

/** Two candidates nothing tells apart: the same words, the same wording. */
const tied = (a: Scored, b: Scored) => a.shared === b.shared && a.overlap === b.overlap

/**
 * The jobs a project could belong to, best first. Anything that shares an
 * identifying word and fits the dates is offered; whether it is *sure* is
 * decided in matchProjectsToJobs.
 */
export function candidateJobs(project: JobProject, jobs: PlanJob[], today: Date = new Date()): PlanJob[] {
  return scoreAll(project, jobs, today).map((s) => s.job)
}

/**
 * Every job that fits the project's dates, scored and sorted. How common a
 * word is gets counted among those jobs only: a customer who has the firm
 * back every year is not a common word, a town that ten jobs of one year
 * mention is.
 */
function scoreAll(project: JobProject, jobs: PlanJob[], today: Date): Scored[] {
  const fitting = jobs.filter((job) => dateFits(job, project, today))
  const freq = wordFrequency(fitting)
  const scored: Scored[] = []
  for (const job of fitting) {
    const s = score(project, job, freq)
    if (s) scored.push(s)
  }
  return scored.sort(byStrength)
}

const jobId = (j: PlanJob) => `${j.year}|${j.key}`

/** Every month a job covers, counted from year 0. */
function jobMonths(job: PlanJob): number[] {
  let year = job.year
  let prev = 0
  return job.months.map((m) => {
    if (m < prev) year++
    prev = m
    return monthIndex(year, m)
  })
}

/**
 * A phase carries the project's own words and nothing more: "Musterhof
 * Innenputz" then "Musterhof Maler" — not "Musterhof Nord", a site of its own.
 */
function phaseOf(project: JobProject): (job: PlanJob) => boolean {
  const words = new Set(siteWords(`${project.name} ${project.customer}`))
  return (job) => jobSiteWords(job).every((w) => words.has(w) || [...words].some((p) => sameWord(p, w)))
}

/** Two jobs that name two different people — "Musterhof Margit", "Musterhof Daniel". */
function peopleClash(a: PlanJob, b: PlanJob): boolean {
  const mine = firstNamesIn(a.names.join(' '))
  const theirs = firstNamesIn(b.names.join(' '))
  if (mine.length === 0 || theirs.length === 0) return false
  return !mine.some((m) => theirs.includes(m))
}

/**
 * Whether a job lies within a few months of one of these, either way round,
 * and is not plainly somebody else's: a relative's job next door is not a phase.
 */
const follows = (cluster: PlanJob[], job: PlanJob) =>
  cluster.every((c) => !peopleClash(c, job)) &&
  cluster.some(
    (c) =>
      jobStart(job) - jobEnd(c) <= PHASE_GAP_MONTHS &&
      jobStart(c) - jobEnd(job) <= PHASE_GAP_MONTHS
  )

/**
 * Matches every project against every job — give it the jobs of all years
 * at once, so a project that could be a 2025 job or a 2026 job is offered
 * both and never quietly handed the first.
 *
 * A project lays a claim when one job fits it firmly and clearly better than
 * any other: more words in common, or the same words in the same wording. A
 * job claimed by two projects goes to neither: the office can tell
 * "Musterhof Estrich" from "Musterhof Nord" in a second, the code cannot.
 * Once a job is surely taken it is out of everybody else's list, which may
 * leave another project with one job — so the claims run until nothing moves.
 *
 * A customer whose jobs no other project could be, following one another a
 * few months apart, has one project doing them in phases; that project takes
 * them all. Not for a council or a school: their "jobs" are different
 * buildings, and a card for one says nothing about the next.
 */
export function matchProjectsToJobs(
  projects: JobProject[],
  jobs: PlanJob[],
  today: Date = new Date()
): JobMatch[] {
  const scoredFor = new Map<string, Scored[]>()
  const fitters = new Map<string, Set<string>>()
  for (const project of projects) {
    const list = scoreAll(project, jobs, today)
    scoredFor.set(project.id, list)
    for (const s of list) {
      const id = jobId(s.job)
      fitters.set(id, (fitters.get(id) ?? new Set()).add(project.id))
    }
  }

  const sureOf = new Map<string, PlanJob[]>()
  const taken = new Set<string>()
  const open = (s: Scored) => !taken.has(jobId(s.job))
  const hasLines = (p: JobProject) => (p.linked?.length ?? 0) > 0

  for (let moved = true; moved; ) {
    moved = false
    const claims = new Map<string, string[]>()
    const claim = (job: PlanJob, projectId: string) => {
      const id = jobId(job)
      claims.set(id, [...(claims.get(id) ?? []), projectId])
    }
    for (const project of projects) {
      if (sureOf.has(project.id)) continue
      const firm = (scoredFor.get(project.id) ?? []).filter((s) => s.firm && open(s))
      if (firm.length === 0) continue
      if (hasLines(project)) {
        // A project with lines already lays a standing claim to the phase
        // next to them: not to take it here, but so that nobody else takes
        // it unchallenged.
        const isPhase = phaseOf(project)
        for (const s of firm) if (isPhase(s.job) && follows(project.linked!, s.job)) claim(s.job, project.id)
        continue
      }
      const [best, next] = firm
      if (next && tied(best, next)) continue
      claim(best.job, project.id)
    }
    for (const [id, who] of claims) {
      if (who.length !== 1) continue
      if (hasLines(projects.find((p) => p.id === who[0])!)) continue
      const job = scoredFor.get(who[0])!.find((s) => jobId(s.job) === id)!.job
      sureOf.set(who[0], [job])
      taken.add(id)
      moved = true
    }
  }

  for (const project of projects) {
    if (isInstitution(project.customer)) continue
    const mine = sureOf.get(project.id) ?? project.linked ?? []
    const isPhase = phaseOf(project)
    const phases = (scoredFor.get(project.id) ?? [])
      .filter((s) => s.firm && open(s) && !mine.includes(s.job) && isPhase(s.job))
      .map((s) => s.job)
    if (phases.length === 0) continue
    // A phase is the project's when nobody else could be doing it — or when
    // it lies between two jobs the project already has: March between its
    // February and its April is its March, whoever else fits the name.
    const months = mine.flatMap(jobMonths)
    const between = (job: PlanJob) =>
      months.some((m) => m < jobStart(job)) && months.some((m) => m > jobEnd(job))
    const sole = (job: PlanJob) => fitters.get(jobId(job))!.size === 1 || between(job)
    // Without a job to start from, the phases must account for every job
    // the customer has; one left over means the picture is not clear.
    if (mine.length === 0 && !phases.every(sole)) continue
    const rest = mine.length ? phases.filter(sole) : phases
    const cluster = mine.length ? [...mine] : [rest[0]]
    for (let grew = true; grew; ) {
      grew = false
      for (const job of rest) {
        if (cluster.includes(job) || !follows(cluster, job)) continue
        cluster.push(job)
        grew = true
      }
    }
    if (mine.length === 0 && cluster.length !== rest.length) continue
    if (cluster.length === mine.length) continue
    sureOf.set(project.id, cluster)
    for (const job of cluster) taken.add(jobId(job))
  }

  return projects.map((project) => {
    // What the project has already is not news; only the new jobs are sure.
    const sure = (sureOf.get(project.id) ?? []).filter((j) => !project.linked?.includes(j))
    const candidates = (scoredFor.get(project.id) ?? [])
      .map((s) => s.job)
      .filter((j) => sure.includes(j) || !taken.has(jobId(j)))
    return { projectId: project.id, sure, candidates }
  })
}

/** First and last day the job spans, as UTC dates for @db.Date columns. */
export function jobSpan(job: PlanJob): { start: Date; end: Date } {
  const first = job.months[0]
  const last = job.months[job.months.length - 1]
  return {
    start: new Date(Date.UTC(job.year, first - 1, 1)),
    // Day 0 of the next month is the last day of this one.
    end: new Date(Date.UTC(job.endYear, last, 0)),
  }
}
