// Stitching the planning sheet and the projects together.
//
// The sheet has one line per site and month; a job that runs from March to
// May is three lines. The projects (from the board) have one row per job. So
// the lines are first folded into JOBS — same site, same year, the months it
// spans — and a project is then matched against jobs, not lines.
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
  year: number
  /** 1-12, ascending, unique. */
  months: number[]
  /** Sum of the lines: what the sheet plans for this job over the year. */
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
}

export type JobMatch = {
  projectId: string
  /** The one job the project surely belongs to. */
  sure: PlanJob | null
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
  'ralf', 'ramiz', 'rene', 'robert', 'rolf', 'sabine', 'sandra', 'sarah',
  'sebastian', 'simon', 'stefan', 'stefanie', 'steffi', 'stephan', 'susanne',
  'sven', 'tanja', 'thomas', 'tim', 'tino', 'tobias', 'tobi', 'udo', 'ulrich',
  'ursula', 'uwe', 'walter', 'werner', 'wolfgang',
])

/** Institutions: they name a kind of customer, never one in particular. */
const INSTITUTION_WORDS = new Set([
  'gemeinde', 'markt', 'stadt', 'bauamt', 'landkreis', 'kreis', 'schule',
  'kindergarten', 'kiga', 'kita', 'feuerwehr', 'ffw', 'mensa', 'kirche',
  'rathaus', 'bank', 'hausverwaltung', 'architekt', 'architekten', 'arch',
  'bauvorhaben', 'metallbau', 'gmbh', 'kg',
])

/** Words that tell one job from another: 3+ letters, no numbers, no work words. */
export function groupingWords(name: string): string[] {
  return tokenize(name).filter(
    (t) => t.length >= 3 && !/^\d+$/.test(t) && !TRADE_WORDS.has(t) && !INSTITUTION_WORDS.has(t)
  )
}

/** The words that identify a site for matching: grouping words minus first names. */
export function siteWords(name: string): string[] {
  return groupingWords(name).filter((t) => !FIRST_NAMES.has(t))
}

/**
 * The grouping key. A line made only of words that identify nothing on their
 * own ("Kindergarten FO") still needs a key of its own, or it could never be
 * shown and linked by hand; the raw words serve, they just never match.
 */
export function jobKey(name: string): string {
  const words = groupingWords(name)
  const base = words.length ? words : tokenize(name)
  return [...new Set(base)].sort().join(' ')
}

/**
 * Folds the sheet's lines into jobs. Lines with the same grouping words in
 * the same year are one job, whatever month they sit in; the amounts add up.
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
  return [...jobs.values()]
}

/** The matching words of a job: its key without first names. */
const jobSiteWords = (job: PlanJob) => job.key.split(' ').filter((w) => !FIRST_NAMES.has(w))

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

/** A word is telling when few jobs carry it. */
const RARE_AT_MOST = 3

/**
 * A job may only belong to a project created in the same year or the year
 * before it (work is planned ahead, not behind). Anything else is ruled out:
 * a card typed in 2026 is not a job from 2023, however similar the name.
 */
function yearFits(job: PlanJob, project: JobProject): boolean {
  if (project.sourceCreatedAt) {
    const y = project.sourceCreatedAt.getUTCFullYear()
    return job.year === y || job.year === y + 1
  }
  // Entered by hand: the work may have started the year before it was typed
  // in, but a job from two years back is somebody else's.
  const y = project.createdAt.getUTCFullYear()
  return job.year === y || job.year === y - 1
}

/**
 * The office shortens place names to their first letter and their ending:
 * "Hbach" for a town ending in "-bach", "Mdorf" for one ending in "-dorf".
 * Two words are the same when one is such a contraction of the other.
 */
const PLACE_ENDINGS = ['bach', 'dorf', 'berg', 'burg', 'heim', 'stadt', 'hausen', 'feld']
export function sameWord(a: string, b: string): boolean {
  if (a === b) return true
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
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
 * "Musterhof" is the whole name; a town both happen to mention is not.
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
    const customerWord = siteWords(project.customer)[0]
    firm =
      customerWord !== undefined &&
      shared.some((w) => sameWord(w, customerWord)) &&
      (freq.get(customerWord) ?? 0) <= RARE_AT_MOST
  }
  return { job, shared: shared.length, overlap, firm }
}

const byStrength = (a: Scored, b: Scored) =>
  b.shared - a.shared || b.overlap - a.overlap || a.job.year - b.job.year

/**
 * The jobs a project could belong to, best first. Anything that shares an
 * identifying word and fits the year is offered; whether it is *sure* is
 * decided in matchProjectsToJobs.
 */
export function candidateJobs(
  project: JobProject,
  jobs: PlanJob[],
  freq: Map<string, number> = wordFrequency(jobs)
): PlanJob[] {
  const scored: Scored[] = []
  for (const job of jobs) {
    if (!yearFits(job, project)) continue
    const s = score(project, job, freq)
    if (s) scored.push(s)
  }
  return scored.sort(byStrength).map((s) => s.job)
}

const jobId = (j: PlanJob) => `${j.year}|${j.key}`

/**
 * Matches every project against every job — give it the jobs of all years
 * at once, so a project that could be a 2025 job or a 2026 job is offered
 * both and never quietly handed the first.
 *
 * A project lays a claim when one job fits it firmly and clearly better than
 * any other (more words in common, not merely a tie-break). A job claimed by
 * two projects goes to neither: the office can tell "Musterhof Estrich" from
 * "Musterhof Nord" in a second, the code cannot.
 */
export function matchProjectsToJobs(projects: JobProject[], jobs: PlanJob[]): JobMatch[] {
  const freq = wordFrequency(jobs)
  const scoredFor = new Map<string, Scored[]>()
  for (const project of projects) {
    const list: Scored[] = []
    for (const job of jobs) {
      if (!yearFits(job, project)) continue
      const s = score(project, job, freq)
      if (s) list.push(s)
    }
    scoredFor.set(project.id, list.sort(byStrength))
  }

  const claims = new Map<string, string[]>()
  const claimOf = new Map<string, PlanJob>()
  for (const project of projects) {
    const firm = (scoredFor.get(project.id) ?? []).filter((s) => s.firm)
    if (firm.length === 0) continue
    const [best, next] = firm
    if (next && next.shared >= best.shared) continue
    const id = jobId(best.job)
    claims.set(id, [...(claims.get(id) ?? []), project.id])
    claimOf.set(project.id, best.job)
  }

  const taken = new Set<string>()
  for (const [id, who] of claims) if (who.length === 1) taken.add(id)

  return projects.map((project) => {
    const claimed = claimOf.get(project.id)
    const job = claimed && taken.has(jobId(claimed)) ? claimed : null
    const candidates = (scoredFor.get(project.id) ?? [])
      .map((s) => s.job)
      .filter((j) => j === job || !taken.has(jobId(j)))
    return { projectId: project.id, sure: job, candidates }
  })
}

/** First and last day the job spans, as UTC dates for @db.Date columns. */
export function jobSpan(job: PlanJob): { start: Date; end: Date } {
  const first = job.months[0]
  const last = job.months[job.months.length - 1]
  return {
    start: new Date(Date.UTC(job.year, first - 1, 1)),
    // Day 0 of the next month is the last day of this one.
    end: new Date(Date.UTC(job.year, last, 0)),
  }
}
