import 'server-only'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import { displayValue, type FormField, type FormValues } from './forms'

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
    if (y - height < MARGIN + 24) newPage()
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

  /** A table's rows under their column heads; a row never breaks over a page, a long table does. */
  const drawTable = (columns: string[], rows: string[][]) => {
    const size = 9
    const pad = 4
    const colWidth = width / columns.length
    const lineHeight = size * 1.3
    const rowLines = (row: string[]) => columns.map((_, c) => wrap(row[c] ?? '', regular, size, colWidth - pad * 2))
    const drawRow = (cells: string[][], font: PDFFont, color = INK) => {
      const height = Math.max(1, ...cells.map((c) => c.length)) * lineHeight + pad * 2
      need(height)
      const top = y
      cells.forEach((lines, c) => {
        const x = MARGIN + c * colWidth
        page.drawLine({ start: { x, y: top }, end: { x, y: top - height }, thickness: 0.4, color: RULE })
        lines.forEach((line, n) => page.drawText(line, { x: x + pad, y: top - pad - size - n * lineHeight, size, font, color }))
      })
      page.drawLine({ start: { x: MARGIN + width, y: top }, end: { x: MARGIN + width, y: top - height }, thickness: 0.4, color: RULE })
      page.drawLine({ start: { x: MARGIN, y: top - height }, end: { x: MARGIN + width, y: top - height }, thickness: 0.4, color: RULE })
      y = top - height
    }
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + width, y }, thickness: 0.4, color: RULE })
    drawRow(columns.map((c) => wrap(c, bold, size, colWidth - pad * 2)), bold, GREY)
    for (const row of rows) drawRow(rowLines(row), regular)
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
  y -= 10
  write(input.title, bold, 18, INK, MARGIN, width - 170)
  write(input.projectLine, regular, 10, GREY)
  if (input.signatures.length === 0) write(input.words.draft, bold, 9, rgb(0.75, 0.35, 0.05))
  y -= 6
  page.drawLine({ start: { x: MARGIN, y }, end: { x: A4[0] - MARGIN, y }, thickness: 1, color: RULE })
  y -= 14

  // ── The fields ─────────────────────────────────────────────────────────────
  for (const field of input.fields) {
    if (field.type === 'heading') {
      need(34)
      y -= 6
      write(field.label, bold, 11.5)
      page.drawLine({ start: { x: MARGIN, y: y + 2 }, end: { x: A4[0] - MARGIN, y: y + 2 }, thickness: 0.5, color: RULE })
      y -= 6
      continue
    }
    if (field.type === 'checkbox') {
      need(18)
      const size = 9
      page.drawRectangle({ x: MARGIN, y: y - size - 1, width: size, height: size, borderColor: INK, borderWidth: 0.8 })
      if (input.values[field.id] === true) {
        page.drawLine({ start: { x: MARGIN + 1.5, y: y - 2.5 }, end: { x: MARGIN + size - 1.5, y: y - size + 0.5 }, thickness: 1.2, color: INK })
        page.drawLine({ start: { x: MARGIN + size - 1.5, y: y - 2.5 }, end: { x: MARGIN + 1.5, y: y - size + 0.5 }, thickness: 1.2, color: INK })
      }
      write(field.label, regular, 10, INK, MARGIN + size + 7, width - size - 7)
      y -= 5
      continue
    }
    if (field.type === 'table') {
      const rows = Array.isArray(input.values[field.id]) ? (input.values[field.id] as string[][]) : []
      need(30)
      write(field.label, regular, 8.5, GREY)
      if (rows.length === 0) write('—', regular, 10.5)
      else drawTable(field.options ?? [], rows)
      y -= 6
      continue
    }
    if (field.type === 'photo') {
      const ids = Array.isArray(input.values[field.id]) ? (input.values[field.id] as string[]) : []
      need(30)
      write(field.label, regular, 8.5, GREY)
      const drawn = await drawPhotos(ids)
      if (drawn === 0) write('—', regular, 10.5)
      y -= 6
      continue
    }
    need(30)
    write(field.label, regular, 8.5, GREY)
    const value = displayValue(field, input.values[field.id], { yes: input.words.yes, no: input.words.no }, input.formatDay)
    write(value || '—', regular, 10.5)
    y -= 6
  }

  // ── The signatures, side by side, two to a row ─────────────────────────────
  if (input.signers.length > 0) {
    const gap = 30
    const colWidth = (width - gap) / 2
    const boxHeight = 118
    for (let i = 0; i < input.signers.length; i += 2) {
      need(boxHeight + 16)
      y -= 16
      for (const slot of [i, i + 1]) {
        if (slot >= input.signers.length) continue
        const x = MARGIN + (slot - i) * (colWidth + gap)
        const signature = input.signatures.find((s) => s.slot === slot)
        const lineY = y - 70
        if (signature) {
          try {
            const image = await pdf.embedPng(Buffer.from(signature.image, 'base64'))
            const scale = Math.min((colWidth - 10) / image.width, 62 / image.height)
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
        lines.slice(0, 2).forEach((line, n) => page.drawText(line, { x, y: lineY - 22 - n * 11, size: 8.5, font: regular, color: GREY }))
      }
      y -= boxHeight
    }
  }

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
