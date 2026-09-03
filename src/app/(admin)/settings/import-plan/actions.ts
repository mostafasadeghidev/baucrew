'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/authz'
import { audit } from '@/lib/audit'
import { parseYearPlanWorkbook } from '@/lib/year-plan-server'
import { mergePlanSheets, planTotals, type PlanEntry } from '@/lib/year-plan-excel'

/** What the preview shows per year found in the workbook. */
export type PlanYearSummary = {
  year: number
  /** Sheets that contributed to this year — usually one. */
  sheets: string[]
  entries: number
  filledMonths: number
  own: number
  sub: number
  total: number
  /** Sites parked on the year without a month. */
  open: number
  /** Rows already stored for that year — they are replaced on import. */
  existing: number
}

export type PlanImportState =
  | { step: 'upload'; error?: 'invalidFile' | 'tooLarge' | 'noPlan' }
  | { step: 'preview'; years: PlanYearSummary[]; entries: PlanEntry[] }
  | { step: 'done'; imported: number; replaced: number; years: number[] }

const MAX_BYTES = 10 * 1024 * 1024

async function preview(formData: FormData): Promise<PlanImportState> {
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { step: 'upload', error: 'invalidFile' }
  if (file.size > MAX_BYTES) return { step: 'upload', error: 'tooLarge' }

  let entries: PlanEntry[]
  let sheetsByYear: Map<number, Set<string>>
  try {
    const sheets = await parseYearPlanWorkbook(Buffer.from(await file.arrayBuffer()))
    entries = mergePlanSheets(sheets)
    sheetsByYear = new Map()
    for (const sheet of sheets) {
      for (const year of new Set(sheet.entries.map((e) => e.year))) {
        if (!sheetsByYear.has(year)) sheetsByYear.set(year, new Set())
        sheetsByYear.get(year)!.add(sheet.sheet)
      }
    }
  } catch {
    return { step: 'upload', error: 'invalidFile' }
  }
  if (entries.length === 0) return { step: 'upload', error: 'noPlan' }

  const found = [...new Set(entries.map((e) => e.year))].sort((a, b) => a - b)
  const existing = await db.planEntry.groupBy({
    by: ['year'],
    where: { year: { in: found } },
    _count: { _all: true },
  })
  const existingByYear = new Map(existing.map((e) => [e.year, e._count._all]))

  const years: PlanYearSummary[] = found.map((year) => {
    const totals = planTotals(entries, year)
    const mine = entries.filter((e) => e.year === year)
    return {
      year,
      sheets: [...(sheetsByYear.get(year) ?? [])],
      entries: mine.length,
      filledMonths: totals.months.filter((m) => m.total > 0).length,
      own: totals.months.reduce((sum, m) => sum + m.own, 0),
      sub: totals.months.reduce((sum, m) => sum + m.sub, 0),
      total: totals.yearTotal + totals.open,
      open: totals.open,
      existing: existingByYear.get(year) ?? 0,
    }
  })

  return { step: 'preview', years, entries }
}

async function run(prev: PlanImportState, formData: FormData): Promise<PlanImportState> {
  const user = await requireAdmin()
  if (prev.step !== 'preview') return { step: 'upload', error: 'invalidFile' }

  const selected = new Set(
    formData
      .getAll('year')
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n))
  )
  const rows = prev.entries.filter((e) => selected.has(e.year))
  if (rows.length === 0) return prev

  const years = [...selected].sort((a, b) => a - b)
  // A year is imported as a whole: the sheet is the truth for it, so the old
  // rows go and the new ones take their place.
  const replaced = await db.$transaction(async (tx) => {
    const removed = await tx.planEntry.deleteMany({ where: { year: { in: years } } })
    await tx.planEntry.createMany({
      data: rows.map((e) => ({
        year: e.year,
        month: e.month,
        name: e.name,
        amount: e.amount,
        isSub: e.isSub,
        source: 'excel',
      })),
    })
    return removed.count
  })

  await audit({
    userId: user.id,
    action: 'import',
    entity: 'PlanEntry',
    entityId: years.join(','),
    newValue: `${rows.length} rows`,
  })

  revalidatePath('/reports')
  revalidatePath('/settings/import-plan')
  return { step: 'done', imported: rows.length, replaced, years }
}

/** Upload → preview → import, all three phases on one action. */
export async function planImportWizard(
  prev: PlanImportState,
  formData: FormData
): Promise<PlanImportState> {
  await requireAdmin()
  return formData.get('_phase') === 'import' ? run(prev, formData) : preview(formData)
}

/** Throws away everything stored for one year. Shaped for `DeleteButton`. */
export async function clearPlanYear(
  year: number,
  _prev: { error?: string },
  _formData: FormData
): Promise<{ error?: string }> {
  const user = await requireAdmin()
  if (!Number.isInteger(year)) return { error: 'invalid' }
  const removed = await db.planEntry.deleteMany({ where: { year } })
  await audit({
    userId: user.id,
    action: 'delete',
    entity: 'PlanEntry',
    entityId: String(year),
    oldValue: `${removed.count} rows`,
  })
  revalidatePath('/reports')
  revalidatePath('/settings/import-plan')
  return {}
}
