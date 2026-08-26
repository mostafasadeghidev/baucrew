import 'server-only'
import ExcelJS from 'exceljs'

export type ParsedSheet = { headers: string[]; rows: unknown[][] }

/** exceljs cell → plain value (rich text, formulas, hyperlinks flattened). */
function plain(v: unknown): unknown {
  if (v == null) return null
  if (v instanceof Date) return v
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if ('result' in o) return plain(o.result)
    if ('text' in o) return plain(o.text)
    if ('richText' in o && Array.isArray(o.richText)) {
      return (o.richText as Array<{ text?: string }>).map((r) => r.text ?? '').join('')
    }
    if ('hyperlink' in o) return plain(o.text ?? o.hyperlink)
  }
  return v
}

function parseCsv(text: string): ParsedSheet {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim())
  if (lines.length === 0) return { headers: [], rows: [] }
  // German exports use ";", others ","
  const delimiter = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ';' : ','
  const split = (line: string): string[] => {
    const out: string[] = []
    let cur = ''
    let quoted = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cur += '"'
          i++
        } else quoted = !quoted
      } else if (ch === delimiter && !quoted) {
        out.push(cur)
        cur = ''
      } else cur += ch
    }
    out.push(cur)
    return out.map((c) => c.trim())
  }
  const [head, ...rest] = lines
  return { headers: split(head), rows: rest.map(split) }
}

/** First worksheet of an .xlsx (or a CSV) → headers from the first row + data rows. */
export async function parseSpreadsheet(buffer: Buffer, fileName: string): Promise<ParsedSheet> {
  if (/\.csv$/i.test(fileName)) return parseCsv(buffer.toString('utf-8'))
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) return { headers: [], rows: [] }
  const headers: string[] = []
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = String(plain(cell.value) ?? '').trim()
  })
  const rows: unknown[][] = []
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const values: unknown[] = []
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      values[col - 1] = plain(cell.value)
    })
    if (values.some((v) => v != null && String(v).trim() !== '')) rows.push(values)
  })
  return { headers: headers.filter((h, i) => h || rows.some((r) => r[i] != null)), rows }
}
