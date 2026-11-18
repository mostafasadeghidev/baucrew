import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { renderFormPdf, type FormPdfInput } from '@/lib/forms-pdf'
import { parseFields, prefillValues, type FormField } from '@/lib/forms'

/** An invented contract-like sheet with every kind of field the renderer knows. */
const fields: FormField[] = parseFields([
  { id: 'intro', type: 'info', label: '', body: 'Musterbedingungen für Beispielarbeiten\nStand: Beispiel' },
  { id: 'h1', type: 'heading', label: '1. Vertragspartner' },
  { id: 'customer', type: 'longtext', label: 'Auftraggeber:', prefill: 'customerWithAddress', half: true },
  { id: 'company', type: 'longtext', label: 'Auftragnehmer:', defaultValue: 'Muster Maler GmbH\nBeispielweg 1\n12345 Musterstadt', half: true },
  { id: 'trades', type: 'multi', label: 'Gewerk:', options: ['Maler', 'Trockenbau', 'Innenputz'], prefill: 'workTypes' },
  { id: 'start', type: 'date', label: 'Der Baubeginn wird am', suffix: 'erfolgen.', prefill: 'plannedStart' },
  { id: 'thick', type: 'number', label: 'mittl. Schichtdicke', suffix: 'mm', half: true },
  { id: 'job', type: 'text', label: 'Vorgangsnr.', prefill: 'jobNumber', half: true },
  {
    id: 'clause',
    type: 'info',
    label: '2. Bedingungen',
    body: 'Ein Absatz Mustertext, der lang genug ist, um umzubrechen, und dann noch ein wenig weiter geht, damit er sicher zwei Zeilen braucht.\n• erster Punkt\n• zweiter Punkt',
  },
  { id: 'opt', type: 'checkbox', label: 'Eine Klausel, als Ganzes angekreuzt.' },
  { id: 'how', type: 'choice', label: '', options: ['ohne Vorbehalte', 'mit Vorbehalten'] },
  {
    id: 'steps',
    type: 'table',
    label: 'Ablauf',
    options: ['Schritt', 'Maßnahme', 'Datum/Uhrzeit/Unterschrift'],
    rows: [
      ['Beginn', 'auf 25 °C', ''],
      ['Ende', 'abgestellt', ''],
    ],
    widths: [3, 3, 2],
  },
  { id: 'defects', type: 'table', label: 'Mängel', options: ['Mangel', 'Termin'], prefill: 'openDefects', widths: [3, 1] },
  { id: 'sign1', type: 'signatures', label: '', options: ['Auftragnehmer'] },
  { id: 'page', type: 'pagebreak', label: '' },
  { id: 'annex', type: 'info', label: 'Anlage', body: 'Musteranlage.' },
])

const input = (overrides: Partial<FormPdfInput> = {}): FormPdfInput => ({
  title: 'Mustervertrag',
  projectLine: '2026-0001 — Musterhaus',
  companyName: 'Muster Maler GmbH',
  logo: null,
  fields,
  values: prefillValues(fields, {
    customerWithAddress: 'Max Mustermann\nMusterstraße 1\n12345 Musterstadt',
    workTypes: 'Maler',
    plannedStart: '2026-11-03',
    jobNumber: '1234567',
    openDefects: '– Riss im Putz (Flur)\n– Farbnase (Bad)',
  }),
  signers: ['Auftragnehmer', 'Auftraggeber'],
  signatures: [],
  digest: 'a'.repeat(64),
  words: { yes: 'Ja', no: 'Nein', signedOn: 'unterschrieben am', notSigned: 'noch nicht unterschrieben', checksum: 'Prüfsumme', page: 'Seite', draft: 'ENTWURF' },
  formatDay: (day) => day.split('-').reverse().join('.'),
  formatStamp: (date) => date.toISOString(),
  ...overrides,
})

describe('renderFormPdf', () => {
  it('draws every kind of field', async () => {
    const bytes = await renderFormPdf(input())
    if (process.env.PDF_OUT) (await import('fs')).writeFileSync(process.env.PDF_OUT, bytes)
    const doc = await PDFDocument.load(bytes)
    expect(doc.getTitle()).toBe('Mustervertrag')
    expect(doc.getPageCount()).toBeGreaterThan(1)
  })

  it('starts a new page at a page break, and never an empty one', async () => {
    const pages = async (kinds: string[]) => {
      const sheet = parseFields(kinds.map((type) => ({ type, label: 'Muster', body: 'Mustertext' })))
      return (await PDFDocument.load(await renderFormPdf(input({ fields: sheet, values: {}, signers: [] })))).getPageCount()
    }
    expect(await pages(['info', 'info'])).toBe(1)
    expect(await pages(['info', 'pagebreak', 'info'])).toBe(2)
    expect(await pages(['info', 'pagebreak', 'pagebreak', 'info'])).toBe(2)
  })

  it('draws a sheet nobody filled in, with room to write by hand', async () => {
    const bytes = await renderFormPdf(input({ values: {} }))
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1)
  })

  it('keeps going over pages when a fixed text is longer than one', async () => {
    const long = parseFields([{ id: 'x', type: 'info', label: 'Lang', body: Array.from({ length: 30 }, () => 'Mustertext '.repeat(40)).join('\n') }])
    const bytes = await renderFormPdf(input({ fields: long, values: {}, signers: [] }))
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1)
  })
})
