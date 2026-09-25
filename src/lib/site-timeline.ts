/**
 * The sites on a time line: a window of weeks around today, and every site's
 * planned span as a bar in it — where the "Aufträge & Baustellen" tab shows
 * at a glance which sites overlap, which run late and which are about to
 * start. Positions are percentages of the window, so the bars are drawn with
 * plain boxes and print as they look.
 *
 * Pure, so the rules are tested without a database. Days are UTC days like
 * every planning date in the app.
 */
import { isoWeek } from './dates'

export type TimelineGroup = 'overdue' | 'running' | 'starting'

export type TimelineJob = {
  id: string
  number: string
  name: string
  group: TimelineGroup
  plannedStart: Date | null
  plannedEnd: Date | null
}

export type TimelineRow = TimelineJob & {
  /** Left edge and width, in percent of the window. */
  left: number
  width: number
}

export type Timeline = {
  rows: TimelineRow[]
  /** The Mondays inside the window, each with its position and calendar week. */
  weeks: Array<{ left: number; week: number }>
  todayLeft: number
  /** Sites with dates that fall outside the window or beyond the row limit. */
  more: number
  /** Sites without a planned start — nothing to draw. */
  undated: number
}

const DAY = 86_400_000
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())

export function siteTimeline(
  jobs: TimelineJob[],
  today: Date,
  { before = 14, after = 42, max = 25 }: { before?: number; after?: number; max?: number } = {}
): Timeline {
  const start = utcDay(today) - before * DAY
  const span = (before + after) * DAY
  const end = start + span
  const pct = (t: number) => ((t - start) / span) * 100

  let undated = 0
  let more = 0
  const placed: Array<{ job: TimelineJob; from: number; to: number }> = []
  for (const job of jobs) {
    if (!job.plannedStart) {
      undated++
      continue
    }
    const from = utcDay(job.plannedStart)
    // A running site with no end runs to today; a bar is at least one day.
    const to = Math.max(from, job.plannedEnd ? utcDay(job.plannedEnd) : Math.max(from, utcDay(today))) + DAY
    if (to <= start || from >= end) {
      more++
      continue
    }
    placed.push({ job, from, to })
  }
  placed.sort((a, b) => a.from - b.from || a.to - b.to)
  more += Math.max(0, placed.length - max)

  const rows = placed.slice(0, max).map(({ job, from, to }) => {
    const left = pct(Math.max(from, start))
    const right = pct(Math.min(to, end))
    return { ...job, left: round(left), width: round(Math.max(right - left, 1.5)) }
  })

  const weeks: Timeline['weeks'] = []
  for (let t = start; t < end; t += DAY) {
    const d = new Date(t)
    if (d.getUTCDay() === 1) weeks.push({ left: round(pct(t)), week: isoWeek(d) })
  }

  return { rows, weeks, todayLeft: round(pct(utcDay(today))), more, undated }
}

const round = (v: number) => Math.round(v * 100) / 100
