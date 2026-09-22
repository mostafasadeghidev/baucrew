/**
 * The sales pipeline (CRM → Pipeline): what is on its way to becoming a job —
 * an enquiry, an offer written, an order placed but not yet planned — in
 * three columns, each with its count, its sum and how long each project has
 * been sitting in it; and, above them, how the year has gone: what was won,
 * what was lost, and the rate between them.
 *
 * Pure logic; the CRM page reads the database.
 */

export const PIPELINE_STAGES = ['LEAD', 'QUOTED', 'APPROVED'] as const
export type PipelineStage = (typeof PIPELINE_STAGES)[number]

/** After this many days in one stage a project is flagged as sitting. */
export const STALE_DAYS: Record<PipelineStage, number> = { LEAD: 7, QUOTED: 21, APPROVED: 30 }

export type PipelineProject = {
  id: string
  number: string
  name: string
  customer: string
  status: string
  /** The order value, or null where none is entered yet. */
  price: number | null
  plannedStart: Date | null
  /** When the project reached its stage — its last status change, or its creation. */
  since: Date
}

export type PipelineCard = PipelineProject & { ageDays: number; stale: boolean }

export type PipelineColumn = {
  stage: PipelineStage
  cards: PipelineCard[]
  count: number
  /** The sum of the values entered; projects without one count toward `unpriced`. */
  sum: number
  unpriced: number
  stale: number
}

const DAY = 86_400_000

export function ageInDays(since: Date, today: Date): number {
  return Math.max(0, Math.floor((today.getTime() - since.getTime()) / DAY))
}

/**
 * The three columns. Within each the longest-sitting project comes first —
 * it is the one that needs the call.
 */
export function pipelineColumns(projects: PipelineProject[], today: Date): PipelineColumn[] {
  return PIPELINE_STAGES.map((stage) => {
    const cards = projects
      .filter((p) => p.status === stage)
      .map((p) => {
        const ageDays = ageInDays(p.since, today)
        return { ...p, ageDays, stale: ageDays >= STALE_DAYS[stage] }
      })
      .sort((a, b) => b.ageDays - a.ageDays || a.number.localeCompare(b.number))
    return {
      stage,
      cards,
      count: cards.length,
      sum: cards.reduce((sum, c) => sum + (c.price ?? 0), 0),
      unpriced: cards.filter((c) => c.price == null).length,
      stale: cards.filter((c) => c.stale).length,
    }
  })
}

/** Where a project's story ended: won once ordered, lost once cancelled, open otherwise. */
export type Outcome = 'won' | 'lost' | 'open'

export function outcomeOf(status: string): Outcome {
  if (status === 'CANCELLED') return 'lost'
  if (status === 'LEAD' || status === 'QUOTED') return 'open'
  return 'won'
}

export type YearFunnel = {
  /** Everything that came in during the year. */
  total: number
  won: number
  lost: number
  open: number
  wonSum: number
  /** Won against decided (won + lost); null before anything is decided. */
  winRate: number | null
}

/** The year's enquiries and where they stand, for the row of tiles over the columns. */
export function yearFunnel(projects: Array<{ status: string; price: number | null }>): YearFunnel {
  let won = 0
  let lost = 0
  let open = 0
  let wonSum = 0
  for (const p of projects) {
    const outcome = outcomeOf(p.status)
    if (outcome === 'won') {
      won += 1
      wonSum += p.price ?? 0
    } else if (outcome === 'lost') lost += 1
    else open += 1
  }
  const decided = won + lost
  return { total: projects.length, won, lost, open, wonSum, winRate: decided === 0 ? null : won / decided }
}
