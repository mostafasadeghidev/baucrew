// What it takes to put a project on the board: the shape of an entry, as
// the schedule dialog and the API both send it, and how it is checked.
// Pure: no database, no request — the writing happens in schedule-service.

import { z } from 'zod'

export type EntryResult = {
  error?: 'duplicateEntry' | 'projectRequired' | 'saveFailed' | 'invalidRange' | 'rangeTooLong' | 'noWorkingDays'
  /** Number of entries created (range mode). */
  created?: number
  /** Number of days taken out of the plan (shortened range). */
  removed?: number
  /** Number of days that already existed and were brought in line. */
  updated?: number
}

const timeField = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (!v) return null
    if (!/^\d{1,2}:\d{2}$/.test(v)) {
      ctx.addIssue({ code: 'custom' })
      return z.NEVER
    }
    return v
  })

export const entrySchema = z.object({
  projectId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : null)),
  saturday: z.boolean().optional().default(false),
  sunday: z.boolean().optional().default(false),
  applyToExisting: z.boolean().optional().default(true),
  vehicleIds: z.array(z.string().min(1)).max(20),
  employeeIds: z.array(z.string().min(1)).max(50),
  startTime: timeField,
  endTime: timeField,
  note: z
    .string()
    .trim()
    .max(1000)
    .transform((v) => (v ? v : null)),
})

/** An entry as checked and normalised — what the service writes. */
export type EntryData = z.infer<typeof entrySchema>

export type EntryInput = {
  projectId: string
  date: string
  /** Create mode only: last day of a "from – to" range (one entry per day). */
  endDate?: string
  /** Range mode: plan Saturdays / Sundays inside the range (default off). */
  saturday?: boolean
  sunday?: boolean
  /** Edit mode: bring days of the range that already exist in line with this entry. */
  applyToExisting?: boolean
  vehicleIds: string[]
  employeeIds: string[]
  startTime: string
  endTime: string
  note: string
}

/** The error a failed check means for the person: the project is the one field that has its own message. */
export function entryErrorKey(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }>): NonNullable<EntryResult['error']> {
  return issues.some((i) => i.path[0] === 'projectId') ? 'projectRequired' : 'saveFailed'
}
