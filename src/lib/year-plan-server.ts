import 'server-only'
import ExcelJS from 'exceljs'
import { parsePlanGrid, type Grid, type PlanSheet } from './year-plan-excel'

/** exceljs cell → plain value (rich text, formulas and hyperlinks flattened). */
function plain(value: unknown): unknown {
  if (value == null) return null
  if (value instanceof Date) return value
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    if ('result' in o) return plain(o.result)
    if ('richText' in o && Array.isArray(o.richText)) {
      return (o.richText as Array<{ text?: string }>).map((r) => r.text ?? '').join('')
    }
    if ('text' in o) return plain(o.text)
    if ('hyperlink' in o) return plain(o.text ?? o.hyperlink)
    if ('formula' in o || 'sharedFormula' in o) return null
  }
  return value
}

/** Guard rails, so a wide or long sheet cannot exhaust the server. */
const MAX_ROWS = 400
const MAX_COLS = 200

function toGrid(sheet: ExcelJS.Worksheet): Grid {
  const rows = Math.min(sheet.rowCount, MAX_ROWS)
  const cols = Math.min(sheet.columnCount, MAX_COLS)
  const grid: Grid = []
  for (let r = 1; r <= rows; r++) {
    const row = sheet.getRow(r)
    const cells: unknown[] = []
    for (let c = 1; c <= cols; c++) cells[c - 1] = plain(row.getCell(c).value)
    grid.push(cells)
  }
  return grid
}

/**
 * Every worksheet of a year-planning workbook that actually holds month
 * blocks. Sheets without them (a subcontractor list, notes) are skipped.
 */
export async function parseYearPlanWorkbook(buffer: Buffer): Promise<PlanSheet[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
  const sheets: PlanSheet[] = []
  for (const worksheet of workbook.worksheets) {
    const parsed = parsePlanGrid(toGrid(worksheet), worksheet.name)
    if (parsed) sheets.push(parsed)
  }
  return sheets
}
