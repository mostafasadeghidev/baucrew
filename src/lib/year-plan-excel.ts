// Reads a "Monatsplanumsatz" year-planning sheet — pure, unit-tested, no I/O.
//
// That kind of sheet is not a table with one row per project. Every month is
// its own little block, and the blocks sit NEXT TO EACH OTHER across the sheet:
//
//        A                 B          |  D                E
//   1                   (Januar)      |               (Februar)
//   2    Baustelle    Planumsatz netto|  Baustelle   Planumsatz netto
//   3    Beispielbau        20000     |  Musterhof        15000
//   …
//   9    Eigene Leute       35000     |  Eigene Leute     15000
//  10    SUB                          |
//  11    Musterputz GmbH    10000     |
//  12    SUB                10000     |
//  13    Geplanter Umsatz   45000     |  Geplanter Umsatz 15000
//
// So the parser locates every "Baustelle / Planumsatz" pair, works out which
// month it belongs to from the cells above it, and then walks downwards until
// the block's total line. The subtotal lines are structural, never sites: the
// bare "SUB" line switches the rest of the block to subcontractor work.

import { normalizePrice } from './import-excel'

export type PlanEntry = {
  year: number
  /** 1-12, or null when the sheet parks a site on a year without a month yet. */
  month: number | null
  name: string
  amount: number
  /** True for everything below the "SUB" line — work given to a subcontractor. */
  isSub: boolean
}

export type PlanSheet = {
  /** Sheet name as it appears in the file, shown in the import preview. */
  sheet: string
  /** The year the sheet is about — from its name, or from the month headers. */
  year: number
  entries: PlanEntry[]
}

/** A worksheet as a plain grid: `grid[row][col]`, both 0-based. */
export type Grid = unknown[][]

const MONTHS = [
  ['januar', 'january', 'jan'],
  ['februar', 'february', 'feb'],
  ['märz', 'maerz', 'march', 'mrz', 'mar'],
  ['april', 'apr'],
  ['mai', 'may'],
  ['juni', 'june', 'jun'],
  ['juli', 'july', 'jul'],
  ['august', 'aug'],
  ['september', 'sept', 'sep'],
  ['oktober', 'october', 'okt', 'oct'],
  ['november', 'nov'],
  ['dezember', 'december', 'dez', 'dec'],
]

/** Lines that close a block. Everything below them belongs to no month. */
const CLOSING_LABEL = /^(geplanter umsatz|geplant für|summe|gesamt|total)/
/** The own-crew subtotal — a structural line, never a site. */
const OWN_TOTAL_LABEL = /^eigene? leute/
/** The bare marker that switches a block over to subcontractor work. */
const SUB_LABELS = new Set([
  'sub',
  'subs',
  'sub unternehmer',
  'subunternehmer',
  'nachunternehmer',
  'fremdleistung',
])

function text(value: unknown): string {
  if (value == null) return ''
  if (value instanceof Date) return ''
  return String(value).trim()
}

/** Lower-cased, single-spaced — for comparing labels. */
function key(value: unknown): string {
  return text(value).toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Month and year of a date cell. Shifted by half a day first, so a sheet that
 * stores local midnight (23:00 the day before, in UTC) still lands in the
 * right month.
 */
function fromDate(value: Date): { month: number; year: number } {
  const shifted = new Date(value.getTime() + 12 * 60 * 60 * 1000)
  return { month: shifted.getUTCMonth() + 1, year: shifted.getUTCFullYear() }
}

function monthFromText(value: string): number | null {
  const k = value.toLowerCase()
  for (let i = 0; i < MONTHS.length; i++) {
    if (MONTHS[i].some((name) => new RegExp(`(^|\\W)${name}(\\W|$)`).test(k))) return i + 1
  }
  return null
}

function yearFromText(value: string): number | null {
  const match = value.match(/\b(19|20)\d{2}\b/)
  return match ? Number(match[0]) : null
}

type Block = {
  nameCol: number
  amountCol: number
  headerRow: number
  month: number | null
  year: number | null
  /** True only for an explicit "Baustellen für <year>" list — those have no month. */
  parked: boolean
}

/** How far above a "Baustelle" header we look for its month caption. */
const HEADER_SCAN_ROWS = 4
/** How far to the right of "Baustelle" the amount column may sit. */
const AMOUNT_SCAN_COLS = 3

function findBlocks(grid: Grid): Block[] {
  const blocks: Block[] = []
  const limit = Math.min(grid.length, 12)

  for (let row = 0; row < limit; row++) {
    const cells = grid[row] ?? []
    for (let col = 0; col < cells.length; col++) {
      if (key(cells[col]) !== 'baustelle') continue

      let amountCol = -1
      for (let c = col + 1; c <= col + AMOUNT_SCAN_COLS && c < cells.length; c++) {
        if (/^planum/.test(key(cells[c]))) {
          amountCol = c
          break
        }
      }
      if (amountCol < 0) continue

      // The caption sits somewhere above, spread over the block's columns.
      let month: number | null = null
      let year: number | null = null
      for (let r = row - 1; r >= 0 && r >= row - HEADER_SCAN_ROWS; r--) {
        for (let c = col; c <= amountCol + 1; c++) {
          const value = grid[r]?.[c]
          if (value instanceof Date) {
            const parsed = fromDate(value)
            month ??= parsed.month
            year ??= parsed.year
            continue
          }
          const caption = text(value)
          if (!caption) continue
          month ??= monthFromText(caption)
          year ??= yearFromText(caption)
        }
        if (month !== null) break
      }

      blocks.push({ nameCol: col, amountCol, headerRow: row, month, year, parked: false })
    }
  }
  return blocks
}

/** "Baustellen für 2027" — sites already promised, with no month yet. */
function findParkedBlocks(grid: Grid): Block[] {
  const blocks: Block[] = []
  for (let row = 0; row < grid.length; row++) {
    const cells = grid[row] ?? []
    for (let col = 0; col < cells.length; col++) {
      const match = key(cells[col]).match(/^baustellen? (?:für|for) ((?:19|20)\d{2})/)
      if (!match) continue
      blocks.push({
        nameCol: col,
        amountCol: col + 1,
        headerRow: row,
        month: null,
        year: Number(match[1]),
        parked: true,
      })
    }
  }
  return blocks
}

function readBlock(grid: Grid, block: Block, fallbackYear: number): PlanEntry[] {
  const entries: PlanEntry[] = []
  const year = block.year ?? fallbackYear
  let isSub = false

  for (let row = block.headerRow + 1; row < grid.length; row++) {
    const name = text(grid[row]?.[block.nameCol])
    const amount = normalizePrice(grid[row]?.[block.amountCol])
    const label = key(name)

    if (CLOSING_LABEL.test(label)) break
    if (!name) continue
    if (OWN_TOTAL_LABEL.test(label)) {
      // The own-crew subtotal closes the own section: whatever follows in this
      // block is subcontractor work, even where the "SUB" caption cell is
      // left empty because the column next to it already carries one.
      isSub = true
      continue
    }
    if (SUB_LABELS.has(label)) {
      // With a number it is the SUB subtotal; bare it opens the SUB section.
      if (amount === null) isSub = true
      continue
    }
    if (amount === null) continue

    entries.push({ year, month: block.month, name: name.slice(0, 200), amount, isSub })
  }

  return entries
}

/**
 * One worksheet → its plan entries. Returns null for sheets that carry no
 * month blocks at all (a sheet listing the subcontractors, for instance).
 */
export function parsePlanGrid(grid: Grid, sheetName: string): PlanSheet | null {
  // A month block whose caption we cannot read is dropped rather than guessed:
  // silently filing it under "no month" would quietly distort the year.
  const blocks = [
    ...findBlocks(grid).filter((b) => b.month !== null),
    ...findParkedBlocks(grid),
  ]
  if (blocks.length === 0) return null

  const fallbackYear =
    yearFromText(sheetName) ?? blocks.find((b) => b.year !== null)?.year ?? null
  if (fallbackYear === null) return null

  const entries = blocks.flatMap((block) => readBlock(grid, block, fallbackYear))
  if (entries.length === 0) return null

  return { sheet: sheetName, year: fallbackYear, entries }
}

/** year + month, the key a plan bucket is replaced by. */
export function bucketKey(year: number, month: number | null): string {
  return `${year}-${month ?? 'open'}`
}

/**
 * Flattens the sheets into the rows to store. A year sheet often ends with a
 * spill-over column for the next January; the sheet that owns that month wins,
 * so importing the whole workbook never counts a month twice.
 */
export function mergePlanSheets(sheets: PlanSheet[]): PlanEntry[] {
  const buckets = new Map<string, PlanEntry[]>()
  for (const sheet of sheets) {
    const seen = new Set<string>()
    for (const entry of sheet.entries) {
      const bucket = bucketKey(entry.year, entry.month)
      if (!seen.has(bucket)) {
        seen.add(bucket)
        buckets.set(bucket, [])
      }
      buckets.get(bucket)!.push(entry)
    }
  }
  return [...buckets.values()].flat()
}

export type PlanTotals = {
  /** 1-12 → planned own / sub / total, plus `open` for entries without a month. */
  months: Array<{ month: number; own: number; sub: number; total: number }>
  open: number
  yearTotal: number
}

/** Adds a year's entries up the way the sheet does. */
export function planTotals(entries: PlanEntry[], year: number): PlanTotals {
  const months = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    own: 0,
    sub: 0,
    total: 0,
  }))
  let open = 0

  for (const entry of entries) {
    if (entry.year !== year) continue
    if (entry.month === null) {
      open += entry.amount
      continue
    }
    const bucket = months[entry.month - 1]
    if (!bucket) continue
    if (entry.isSub) bucket.sub += entry.amount
    else bucket.own += entry.amount
    bucket.total = bucket.own + bucket.sub
  }

  return { months, open, yearTotal: months.reduce((sum, m) => sum + m.total, 0) }
}
