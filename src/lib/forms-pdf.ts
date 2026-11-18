import 'server-only'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import { displayValue, signaturePlaces, type FormField, type FormValue, type FormValues } from './forms'

/**
 * A filled form as a sheet of A4 — what is kept on the project once it is
 * signed, and what is printed or sent before that.
 *
 * Drawn by hand with pdf-lib rather than printed from a page: the server has
 * no browser to print with, and a protocol with two signatures on it should
 * look the same whoever made it, on whatever device.
 *
 * The standard fonts speak Western European (WinAnsi) — every German letter,
 * the euro, the long dashes and the low quotes. A character outside that is
 * written as "?" instead of stopping the whole sheet.
 */

export type FormPdfPhoto = { bytes: Uint8Array; type: 'png' | 'jpg' }

export type FormPdfInput = {
  title: string
  /** "2026-0048 — Musterhaus Fassade" */
  projectLine: string
  companyName: string
  /** The company's logo as a data URL; drawn when it is a PNG or a JPEG. */
  logo: string | null
  fields: FormField[]
  values: FormValues
  /** The pictures of the photo fields, by document id — the ones that could be read. */
  photos?: Map<string, FormPdfPhoto>
  signers: string[]
  signatures: Array<{ slot: number; role: string; name: string; image: string; signedAt: Date; digest: string }>
  /** The digest of the form as it stands — differs from a signature's when the content was changed after it. */
  digest: string
  words: { yes: string; no: string; signedOn: string; notSigned: string; checksum: string; page: string; draft: string }
  formatDay: (iso: string) => string
  formatStamp: (date: Date) => string
}

const A4: [number, number] = [595.28, 841.89]
const MARGIN = 50
const INK = rgb(0.1, 0.1, 0.12)
const GREY = rgb(0.42, 0.44, 0.48)
const RULE = rgb(0.8, 0.82, 0.85)
/** What was filled in: a dark blue, the way a pen writes on a printed form. */
const PEN = rgb(0.06, 0.16, 0.45)
/** The lines to write on, and a table's grid. */
const LINE_INK = rgb(0.35, 0.37, 0.4)
const GRID = rgb(0.45, 0.47, 0.5)
const HEAD_FILL = rgb(0.92, 0.92, 0.93)
const FIELD_GAP = 5

export async function renderFormPdf(input: FormPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(input.title)
  pdf.setAuthor(input.companyName)
  pdf.setCreator('BauCrew')
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const known = new Set(regular.getCharacterSet())
  /** Only what the font can write; a tab is a space, anything else unknown a "?". */
  const safe = (text: string) =>
    Array.from(text.replace(/\t/g, ' ').replace(/\r/g, ''))
      .map((ch) => (ch === '\n' || known.has(ch.codePointAt(0)!) ? ch : '?'))
      .join('')

  const width = A4[0] - MARGIN * 2
  let page: PDFPage = pdf.addPage(A4)
  let y = A4[1] - MARGIN

  const newPage = () => {
    page = pdf.addPage(A4)
    y = A4[1] - MARGIN
  }
  const need = (height: number) => {
    if (y - height < MARGIN + 8) newPage()
  }

  /** Words put on lines no wider than `max`; a word longer than a line is cut. */
  const wrap = (text: string, font: PDFFont, size: number, max: number): string[] => {
    const lines: string[] = []
    for (const paragraph of safe(text).split('\n')) {
      let line = ''
      for (const word of paragraph.split(/ +/)) {
        let rest = word
        while (font.widthOfTextAtSize(rest, size) > max) {
          let cut = rest.length - 1
          while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > max) cut--
          if (line) lines.push(line)
          lines.push(rest.slice(0, cut))
          line = ''
          rest = rest.slice(cut)
        }
        const candidate = line ? `${line} ${rest}` : rest
        if (font.widthOfTextAtSize(candidate, size) > max && line) {
          lines.push(line)
          line = rest
        } else {
          line = candidate
        }
      }
      lines.push(line)
    }
    return lines
  }

  const write = (text: string, font: PDFFont, size: number, color = INK, x = MARGIN, max = width) => {
    for (const line of wrap(text, font, size, max)) {
      need(size * 1.4)
      page.drawText(line, { x, y: y - size, size, font, color })
      y -= size * 1.4
    }
  }

  /**
   * Whether drawing only measures: a pair of half fields is measured first, so
   * that both land on the same page. While measuring nothing is drawn and no
   * page is begun; while a pair is drawn (`hold`) neither half begins one.
   */
  let dry = false
  let hold = false
  const fits = (height: number) => !(y - height < MARGIN + 8)
  const room = (height: number) => {
    if (!dry && !hold && !fits(height)) newPage()
  }
  const text = (line: string, x: number, at: number, size: number, font: PDFFont, color = INK) => {
    if (!dry) page.drawText(line, { x, y: at, size, font, color })
  }
  const rule = (x1: number, at: number, x2: number, thickness = 0.5, color = RULE) => {
    if (!dry) page.drawLine({ start: { x: x1, y: at }, end: { x: x2, y: at }, thickness, color })
  }
  /** A box to tick, its top at `top`; a cross in it when ticked. */
  const tickBox = (x: number, top: number, ticked: boolean, size = 9) => {
    if (dry) return
    page.drawRectangle({ x, y: top - size, width: size, height: size, borderColor: INK, borderWidth: 0.8 })
    if (ticked) {
      page.drawLine({ start: { x: x + 1.5, y: top - 1.5 }, end: { x: x + size - 1.5, y: top - size + 1.5 }, thickness: 1.2, color: PEN })
      page.drawLine({ start: { x: x + size - 1.5, y: top - 1.5 }, end: { x: x + 1.5, y: top - size + 1.5 }, thickness: 1.2, color: PEN })
    }
  }
  const writeLines = (lines: string[], font: PDFFont, size: number, color: ReturnType<typeof rgb>, x: number, lineHeight = size * 1.4) => {
    for (const line of lines) {
      room(lineHeight)
      text(line, x, y - size, size, font, color)
      y -= lineHeight
    }
  }

  /** A column of the page: the whole width, or one half of it. */
  type Column = { x: number; w: number }
  const full: Column = { x: MARGIN, w: width }
  const SIZE = 10
  const LINE = 14.5
  const BLANK = 90

  /**
   * A short field the way a printed form has it: "Label: value" on one line,
   * the value on a line of its own to write on, and what follows after it —
   * "Der Baubeginn wird am 03.11.2026 erfolgen.". Wrapped when long.
   */
  const inline = (label: string, value: string, suffix: string, col: Column) => {
    type Token = { word: string; kind: 'label' | 'value' | 'blank' | 'suffix'; width: number }
    const space = regular.widthOfTextAtSize(' ', SIZE)
    const words = (t: string, kind: Token['kind']): Token[] =>
      safe(t)
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => ({ word, kind, width: regular.widthOfTextAtSize(word, SIZE) }))
    const tokens = [
      ...words(label, 'label'),
      ...(value ? words(value, 'value') : [{ word: '', kind: 'blank' as const, width: BLANK }]),
      ...words(suffix, 'suffix'),
    ]
    const lines: Array<Array<Token & { x: number }>> = [[]]
    let x = col.x
    let previous: Token['kind'] | null = null
    for (const token of tokens) {
      const current = lines[lines.length - 1]
      // A little more air where the written part begins and ends, so the line to write on stands apart.
      const air = previous !== null && (token.kind === 'value' || token.kind === 'blank') !== (previous === 'value' || previous === 'blank') ? 3 : 0
      previous = token.kind
      const at = current.length === 0 ? col.x : x + space + air
      if (current.length > 0 && at + token.width > col.x + col.w) {
        lines.push([{ ...token, x: col.x }])
        x = col.x + token.width
      } else {
        current.push({ ...token, x: at })
        x = at + token.width
      }
    }
    lines.forEach((line, n) => {
      room(LINE)
      for (const token of line) if (token.word) text(token.word, token.x, y - SIZE, SIZE, regular, token.kind === 'value' ? PEN : INK)
      // The line to write on: under the value, from its first word to its last — to the column's end when nothing follows.
      const marked = line.filter((t) => t.kind === 'value' || t.kind === 'blank')
      if (marked.length > 0) {
        const last = marked[marked.length - 1]
        const open = n === lines.length - 1 && line[line.length - 1] === last
        rule(marked[0].x - 1, y - SIZE - 2.5, open ? Math.max(col.x + col.w, last.x + last.width) : last.x + last.width + 1, 0.5, LINE_INK)
      }
      y -= LINE
    })
  }

  /** A long text on ruled lines — two empty ones at least, to write on by hand. */
  const ruled = (label: string, value: string, col: Column) => {
    if (label) writeLines(wrap(label, regular, SIZE, col.w), regular, SIZE, INK, col.x, LINE)
    const lines = value ? wrap(value, regular, SIZE, col.w - 4) : []
    while (lines.length < 2) lines.push('')
    for (const line of lines) {
      room(LINE + 2)
      y -= 2
      if (line) text(line, col.x + 2, y - SIZE, SIZE, regular, PEN)
      rule(col.x, y - SIZE - 2.5, col.x + col.w, 0.5, LINE_INK)
      y -= LINE
    }
  }

  /** A tick and its line, the words beside the box wrapped under each other. */
  const ticked = (label: string, on: boolean, col: Column) => {
    const lines = wrap(label, regular, SIZE, col.w - 16)
    lines.forEach((line, n) => {
      room(LINE)
      if (n === 0) tickBox(col.x, y - 1.5, on)
      text(line, col.x + 16, y - SIZE, SIZE, regular, INK)
      y -= LINE
    })
  }

  /** Every answer of a choice with its box, the chosen ones ticked: on one line when they fit, under each other when not. */
  const answers = (label: string, options: string[], chosen: string[], col: Column) => {
    const gap = 18
    const widthOf = (o: string) => 16 + regular.widthOfTextAtSize(safe(o), SIZE)
    const row = options.reduce((sum, o) => sum + widthOf(o), 0) + gap * (options.length - 1)
    const labelWidth = label ? regular.widthOfTextAtSize(safe(label), SIZE) + gap : 0
    const drawRow = (from: number) => {
      room(LINE)
      let x = from
      for (const option of options) {
        tickBox(x, y - 1.5, chosen.includes(option))
        text(safe(option), x + 16, y - SIZE, SIZE, regular, INK)
        x += widthOf(option) + gap
      }
      y -= LINE
    }
    if (label && labelWidth + row <= col.w) {
      room(LINE)
      text(safe(label), col.x, y - SIZE, SIZE, regular, INK)
      drawRow(col.x + labelWidth)
      return
    }
    if (label) writeLines(wrap(label, regular, SIZE, col.w), regular, SIZE, INK, col.x, LINE)
    if (row <= col.w) return drawRow(col.x)
    // Too many for one line: in columns, as many as the widest answer allows — under each other when it is one.
    const widest = Math.max(...options.map(widthOf))
    const columns = Math.min(options.length, Math.floor((col.w + gap) / (widest + gap)))
    if (columns <= 1) {
      for (const option of options) ticked(option, chosen.includes(option), col)
      return
    }
    const step = (col.w + gap) / columns
    for (let i = 0; i < options.length; i += columns) {
      room(LINE)
      options.slice(i, i + columns).forEach((option, n) => {
        const x = col.x + n * step
        tickBox(x, y - 1.5, chosen.includes(option))
        text(safe(option), x + 16, y - SIZE, SIZE, regular, INK)
      })
      y -= LINE
    }
  }

  /** A fixed text: its title in bold, its paragraphs, a line beginning "• " or "- " as a point of a list. */
  const fixedText = (title: string, body: string) => {
    const size = 9
    const lineHeight = size * 1.36
    if (title) writeLines(wrap(title, bold, SIZE, width), bold, SIZE, INK, MARGIN, LINE)
    for (const paragraph of (body ?? '').split('\n')) {
      if (!paragraph.trim()) {
        y -= lineHeight * 0.5
        continue
      }
      const point = /^\s*[•\-–]\s+/.exec(paragraph)
      if (point) {
        const lines = wrap(paragraph.slice(point[0].length), regular, size, width - 16)
        lines.forEach((line, n) => {
          room(lineHeight)
          if (n === 0) text('•', MARGIN + 4, y - size, size, regular, INK)
          text(line, MARGIN + 16, y - size, size, regular, INK)
          y -= lineHeight
        })
      } else {
        writeLines(wrap(paragraph, regular, size, width), regular, size, INK, MARGIN, lineHeight)
      }
    }
  }

  /**
   * A table's rows under their column heads; a row never breaks over a page, a
   * long table does. A table nobody wrote into gets empty rows to write in by
   * hand; the template's own words stand in ink, what was filled in in pen.
   */
  const drawTable = (field: FormField, rows: string[][]) => {
    const columns = field.options ?? []
    const size = 9
    const pad = 3.5
    const weights = field.widths && field.widths.length === columns.length ? field.widths : columns.map(() => 1)
    const total = weights.reduce((a, b) => a + b, 0)
    const widths = weights.map((w) => (width * w) / total)
    const lefts = widths.map((_, c) => MARGIN + widths.slice(0, c).reduce((a, b) => a + b, 0))
    const lineHeight = size * 1.25
    const drawRow = (cells: string[], header: boolean, fixed: (c: number) => boolean) => {
      const lines = cells.map((cell, c) => wrap(cell, header ? bold : regular, size, widths[c] - pad * 2))
      const height = Math.max(1, ...lines.map((l) => l.length)) * lineHeight + pad * 2 + (header ? 2 : 0)
      room(height)
      const top = y
      if (header && !dry) page.drawRectangle({ x: MARGIN, y: top - height, width, height, color: HEAD_FILL })
      lines.forEach((cellLines, c) => {
        cellLines.forEach((line, n) =>
          text(line, lefts[c] + pad, top - pad - size - n * lineHeight, size, header ? bold : regular, header || fixed(c) ? INK : PEN)
        )
      })
      if (!dry) {
        for (const x of [...lefts, MARGIN + width]) page.drawLine({ start: { x, y: top }, end: { x, y: top - height }, thickness: 0.5, color: GRID })
        page.drawLine({ start: { x: MARGIN, y: top }, end: { x: MARGIN + width, y: top }, thickness: 0.5, color: GRID })
        page.drawLine({ start: { x: MARGIN, y: top - height }, end: { x: MARGIN + width, y: top - height }, thickness: 0.5, color: GRID })
      }
      y = top - height
    }
    drawRow(columns, true, () => true)
    if (rows.length === 0) {
      for (let i = 0; i < 3; i++) drawRow(columns.map(() => ''), false, () => false)
      return
    }
    rows.forEach((row, r) => drawRow(row, false, (c) => Boolean(field.rows?.[r]?.[c])))
  }

  /** The pictures two to a row, each scaled to fit its half; one the file cannot give is left out. */
  const drawPhotos = async (ids: string[]) => {
    const gap = 10
    const boxWidth = (width - gap) / 2
    const boxHeight = 170
    let drawn = 0
    for (const id of ids) {
      const photo = input.photos?.get(id)
      if (!photo) continue
      let image: PDFImage
      try {
        image = photo.type === 'png' ? await pdf.embedPng(photo.bytes) : await pdf.embedJpg(photo.bytes)
      } catch {
        continue
      }
      const scale = Math.min(boxWidth / image.width, boxHeight / image.height, 1)
      const w = image.width * scale
      const h = image.height * scale
      if (drawn % 2 === 0) {
        need(boxHeight + 6)
      }
      const x = MARGIN + (drawn % 2) * (boxWidth + gap)
      page.drawImage(image, { x, y: y - h, width: w, height: h })
      drawn++
      if (drawn % 2 === 0) y -= boxHeight + 6
    }
    if (drawn % 2 === 1) y -= boxHeight + 6
    return drawn
  }

  /** The boxes of these signers, two to a row: the drawing on the line, the role under it, the name and the time. */
  const drawSignatures = async (slots: number[]) => {
    const gap = 30
    const colWidth = (width - gap) / 2
    const boxHeight = 86
    for (let i = 0; i < slots.length; i += 2) {
      need(boxHeight + 10)
      y -= 10
      for (const [n, slot] of slots.slice(i, i + 2).entries()) {
        const x = MARGIN + n * (colWidth + gap)
        const signature = input.signatures.find((s) => s.slot === slot)
        const lineY = y - 50
        if (signature) {
          try {
            const image = await pdf.embedPng(Buffer.from(signature.image, 'base64'))
            const scale = Math.min((colWidth - 10) / image.width, 46 / image.height)
            page.drawImage(image, { x: x + 4, y: lineY + 3, width: image.width * scale, height: image.height * scale })
          } catch {
            // A drawing that cannot be read leaves the line empty; the name and the time still stand.
          }
        }
        page.drawLine({ start: { x, y: lineY }, end: { x: x + colWidth, y: lineY }, thickness: 0.8, color: INK })
        const label = safe(signature?.role ?? input.signers[slot])
        page.drawText(label, { x, y: lineY - 11, size: 8.5, font: bold, color: INK })
        const under = signature ? `${signature.name} · ${input.words.signedOn} ${input.formatStamp(signature.signedAt)}` : input.words.notSigned
        const lines = wrap(under, regular, 8.5, colWidth)
        lines.slice(0, 2).forEach((line, k) => page.drawText(line, { x, y: lineY - 22 - k * 11, size: 8.5, font: regular, color: GREY }))
      }
      y -= boxHeight
    }
  }

  const stringOf = (value: FormValue | undefined) => (typeof value === 'string' ? value : '')
  const listOf = (value: FormValue | undefined) => (Array.isArray(value) ? (value as string[]) : [])

  /** One field that is not drawn by itself — the kinds that may stand at half the width. */
  const short = (field: FormField, col: Column) => {
    const value = input.values[field.id]
    if (field.type === 'checkbox') ticked(field.label, value === true, col)
    else if (field.type === 'choice') answers(field.label, field.options ?? [], stringOf(value) ? [stringOf(value)] : [], col)
    else if (field.type === 'multi') answers(field.label, field.options ?? [], listOf(value), col)
    else if (field.type === 'longtext') ruled(field.label, stringOf(value), col)
    else {
      const shown = displayValue(field, value, { yes: input.words.yes, no: input.words.no }, input.formatDay)
      // A label ends in a colon unless it is the start of a sentence the value goes on.
      const label = field.label && !field.suffix && !/[:?.!]$/.test(field.label) ? `${field.label}:` : field.label
      inline(label, shown, field.suffix ?? '', col)
    }
  }

  /** How much room a short field takes in a column, measured without drawing. */
  const measure = (field: FormField, col: Column) => {
    const [top, wasDry] = [y, dry]
    dry = true
    short(field, col)
    const height = top - y
    y = top
    dry = wasDry
    return height
  }

  // ── Head: the company, its logo on the right, the form's name, the project ──
  let logo: PDFImage | null = null
  const match = input.logo ? /^data:image\/(png|jpe?g);base64,([\s\S]+)$/.exec(input.logo) : null
  if (match) {
    try {
      const bytes = Buffer.from(match[2], 'base64')
      logo = match[1] === 'png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
    } catch {
      logo = null
    }
  }
  if (logo) {
    const scale = Math.min(150 / logo.width, 48 / logo.height, 1)
    page.drawImage(logo, { x: A4[0] - MARGIN - logo.width * scale, y: y - logo.height * scale, width: logo.width * scale, height: logo.height * scale })
  }
  write(input.companyName, bold, 11, GREY, MARGIN, width - 170)
  y -= 4
  write(input.title, bold, 17, INK, MARGIN, width - 170)
  write(input.projectLine, regular, 10, GREY)
  if (input.signatures.length === 0) write(input.words.draft, bold, 9, rgb(0.75, 0.35, 0.05))
  y -= 4
  page.drawLine({ start: { x: MARGIN, y }, end: { x: A4[0] - MARGIN, y }, thickness: 1, color: RULE })
  y -= 10

  // ── The fields ─────────────────────────────────────────────────────────────
  const places = signaturePlaces(input.fields, input.signers)
  const top = () => y >= A4[1] - MARGIN - 1
  for (let i = 0; i < input.fields.length; i++) {
    const field = input.fields[i]
    const next = input.fields[i + 1]
    if (field.half && next?.half) {
      // Two halves side by side, on the same page: the taller one says how much room the row needs.
      const gap = 24
      const left: Column = { x: MARGIN, w: (width - gap) / 2 }
      const right: Column = { x: MARGIN + (width + gap) / 2, w: (width - gap) / 2 }
      need(Math.max(measure(field, left), measure(next, right)))
      const start = y
      hold = true
      short(field, left)
      const leftEnd = y
      y = start
      short(next, right)
      y = Math.min(leftEnd, y)
      hold = false
      y -= FIELD_GAP
      i++
      continue
    }
    if (field.type === 'heading') {
      // A heading never stands alone at the foot of a page: it comes with the first lines under it.
      need(80)
      y -= 6
      write(field.label, bold, 11.5)
      page.drawLine({ start: { x: MARGIN, y: y + 2 }, end: { x: A4[0] - MARGIN, y: y + 2 }, thickness: 0.5, color: RULE })
      y -= 6
      continue
    }
    if (field.type === 'pagebreak') {
      if (!top()) newPage()
      continue
    }
    if (field.type === 'info') {
      need(30)
      fixedText(field.label, field.body ?? '')
      y -= FIELD_GAP
      continue
    }
    if (field.type === 'signatures') {
      if (field.label) {
        need(30)
        write(field.label, bold, SIZE)
      }
      await drawSignatures(places.get(field.id) ?? [])
      y -= FIELD_GAP
      continue
    }
    if (field.type === 'table') {
      const rows = Array.isArray(input.values[field.id]) ? (input.values[field.id] as string[][]) : []
      need(50)
      if (field.label) write(field.label, regular, SIZE, INK)
      y -= 2
      drawTable(field, rows)
      y -= FIELD_GAP + 2
      continue
    }
    if (field.type === 'photo') {
      const ids = Array.isArray(input.values[field.id]) ? (input.values[field.id] as string[]) : []
      need(30)
      write(field.label, regular, SIZE, INK)
      const drawn = await drawPhotos(ids)
      if (drawn === 0) write('—', regular, 10.5)
      y -= FIELD_GAP
      continue
    }
    need(Math.min(measure(field, full), 120))
    short(field, full)
    y -= FIELD_GAP
  }

  // ── Whoever signs and is placed nowhere else: under all fields ────────────
  await drawSignatures(places.get('end') ?? [])

  // ── Foot of every page: the digest and the page number ────────────────────
  const pages = pdf.getPages()
  pages.forEach((p, n) => {
    const foot = safe(`${input.words.checksum}: ${input.digest.slice(0, 32)}…`)
    p.drawText(foot, { x: MARGIN, y: MARGIN - 18, size: 7, font: regular, color: GREY })
    const number = safe(`${input.words.page} ${n + 1}/${pages.length}`)
    p.drawText(number, { x: A4[0] - MARGIN - regular.widthOfTextAtSize(number, 7), y: MARGIN - 18, size: 7, font: regular, color: GREY })
  })

  return pdf.save()
}
