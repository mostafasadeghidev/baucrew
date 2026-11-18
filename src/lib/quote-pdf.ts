import { getDocumentProxy } from 'unpdf'
import { linesFromItems, type PageTextItem } from './quotes'

/**
 * The words of a PDF, page by page and row by row, for the quote reader
 * (src/lib/quotes.ts). Plain JavaScript (unpdf, a build of pdf.js) — nothing
 * native, nothing sent anywhere. A quote's sums stand on its last pages, so
 * a very long file is read at its start and its end only.
 */

/** Pages read from the start, and from the end, of a long file. */
const HEAD_PAGES = 4
const TAIL_PAGES = 12

export type PdfLines = { pages: string[][]; pageCount: number }

/** Throws when the file is no PDF it can open (damaged, or locked with a password). */
export async function pdfLines(data: Uint8Array): Promise<PdfLines> {
  // pdf.js takes the buffer over; a copy keeps the caller's bytes whole.
  const pdf = await getDocumentProxy(new Uint8Array(data), { verbosity: 0 })
  try {
    const count = pdf.numPages
    const numbers = count <= HEAD_PAGES + TAIL_PAGES
      ? Array.from({ length: count }, (_, i) => i + 1)
      : [...Array.from({ length: HEAD_PAGES }, (_, i) => i + 1), ...Array.from({ length: TAIL_PAGES }, (_, i) => count - TAIL_PAGES + i + 1)]
    const pages: string[][] = []
    for (const number of numbers) {
      const page = await pdf.getPage(number)
      const content = await page.getTextContent()
      const items: PageTextItem[] = []
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue
        items.push({ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: Math.abs(item.transform[3]) || item.height })
      }
      pages.push(linesFromItems(items))
      page.cleanup()
    }
    return { pages, pageCount: count }
  } finally {
    // Frees the worker's copy of the file; older builds of the proxy have no such call.
    await Promise.resolve((pdf as { destroy?: () => Promise<void> | void }).destroy?.()).catch(() => {})
  }
}

/** Whether a file is a PDF by its first bytes — Trello's files often come as "octet-stream". */
export function looksLikePdf(data: Uint8Array): boolean {
  return data.length > 4 && data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46
}
