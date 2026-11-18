import { describe, expect, it } from 'vitest'
import {
  ACCEPTANCE_PROTOCOL,
  badNumbers,
  cleanValues,
  displayValue,
  fieldName,
  formStatus,
  germanDay,
  missingRequired,
  parseFields,
  parseSigners,
  prefillValues,
  signatureBase64,
  signaturePlaces,
  signedContent,
  type FormField,
} from '@/lib/forms'

describe('parseFields', () => {
  it('keeps what is a field and drops what is not', () => {
    const fields = parseFields([
      { id: 'a', type: 'text', label: ' Bauvorhaben ', required: true, prefill: 'projectName' },
      { type: 'text', label: '' },
      { type: 'video', label: 'Film' },
      'rubbish',
      { id: 'h', type: 'heading', label: 'Abnahme', required: true, prefill: 'today' },
    ])
    expect(fields).toEqual([
      { id: 'a', type: 'text', label: 'Bauvorhaben', required: true, prefill: 'projectName' },
      { id: 'h', type: 'heading', label: 'Abnahme' },
    ])
    expect(parseFields('nothing')).toEqual([])
  })

  it('gives every field an id of its own, and keeps the ones it is given', () => {
    const fields = parseFields([
      { id: 'date', type: 'date', label: 'Datum' },
      { id: 'date', type: 'date', label: 'Frist' },
      { id: 'not an id!', type: 'text', label: 'Ort' },
    ])
    expect(fields.map((f) => f.id)).toEqual(['date', 'f2', 'f3'])
  })

  it('wants answers for a choice, each once', () => {
    expect(parseFields([{ type: 'choice', label: 'Ergebnis', options: [] }])).toEqual([])
    expect(parseFields([{ type: 'choice', label: 'Ergebnis', options: ['ja', ' ja ', '', 'nein'] }])[0].options).toEqual(['ja', 'nein'])
  })

  it('has no prefill for a tick', () => {
    expect(parseFields([{ type: 'checkbox', label: 'Besenrein', prefill: 'today' }])[0]).toEqual({ id: 'f1', type: 'checkbox', label: 'Besenrein' })
  })
})

describe('parseSigners', () => {
  it('names each signer once, four at most', () => {
    expect(parseSigners([' Auftraggeber ', '', 'Auftragnehmer', 'Auftraggeber'])).toEqual(['Auftraggeber', 'Auftragnehmer'])
    expect(parseSigners(['a', 'b', 'c', 'd', 'e'])).toHaveLength(4)
    expect(parseSigners(null)).toEqual([])
  })
})

const fields: FormField[] = [
  { id: 'h', type: 'heading', label: 'Bauvorhaben' },
  { id: 'name', type: 'text', label: 'Bauvorhaben', prefill: 'projectName', required: true },
  { id: 'date', type: 'date', label: 'Datum', prefill: 'today', required: true },
  { id: 'result', type: 'choice', label: 'Ergebnis', options: ['ohne Mängel', 'mit Mängeln'], required: true },
  { id: 'clean', type: 'checkbox', label: 'Besenrein', required: true },
  { id: 'notes', type: 'longtext', label: 'Bemerkungen' },
]

describe('prefillValues', () => {
  it('puts in what the project knows and leaves the rest empty', () => {
    expect(prefillValues(fields, { projectName: 'Musterhaus Fassade', today: '2026-09-21' })).toEqual({
      name: 'Musterhaus Fassade',
      date: '2026-09-21',
      result: '',
      clean: false,
      notes: '',
    })
  })
})

describe('cleanValues', () => {
  it('holds what was sent against the fields', () => {
    expect(
      cleanValues(fields, { name: '  Musterhaus ', date: '21.09.2026', result: 'vielleicht', clean: 'on', notes: 'x'.repeat(6000), stranger: 'no' })
    ).toEqual({ name: 'Musterhaus', date: '', result: '', clean: true, notes: 'x'.repeat(5000) })
    expect(cleanValues(fields, { date: '2026-09-21', result: 'mit Mängeln', clean: false })).toMatchObject({ date: '2026-09-21', result: 'mit Mängeln', clean: false })
    expect(cleanValues(fields, null)).toEqual({ name: '', date: '', result: '', clean: false, notes: '' })
  })
})

describe('missingRequired', () => {
  it('names the required fields that are empty — a tick that must be set counts', () => {
    const values = cleanValues(fields, { name: 'Musterhaus', date: '2026-09-21' })
    expect(missingRequired(fields, values).map((f) => f.id)).toEqual(['result', 'clean'])
    expect(missingRequired(fields, { ...values, result: 'ohne Mängel', clean: true })).toEqual([])
  })
})

describe('formStatus', () => {
  it('is a draft, partly signed, or signed', () => {
    expect(formStatus(['A', 'B'], [])).toBe('draft')
    expect(formStatus(['A', 'B'], [1])).toBe('partly')
    expect(formStatus(['A', 'B'], [0, 1])).toBe('signed')
    // A slot the form does not have is nobody's signature.
    expect(formStatus(['A'], [3])).toBe('draft')
    expect(formStatus([], [])).toBe('draft')
  })
})

describe('signedContent', () => {
  it('is the same for the same form, however its values were stored', () => {
    const a = signedContent('Abnahme', fields, { name: 'x', date: '2026-09-21', result: '', clean: true, notes: '' }, ['A'])
    const b = signedContent('Abnahme', fields, { notes: '', clean: true, result: '', date: '2026-09-21', name: 'x' }, ['A'])
    expect(a).toBe(b)
  })

  it('changes with a value, a label, the title or who signs', () => {
    const values = { name: 'x', date: '', result: '', clean: false, notes: '' }
    const base = signedContent('Abnahme', fields, values, ['A'])
    expect(signedContent('Abnahme', fields, { ...values, name: 'y' }, ['A'])).not.toBe(base)
    expect(signedContent('Abnahme 2', fields, values, ['A'])).not.toBe(base)
    expect(signedContent('Abnahme', fields, values, ['A', 'B'])).not.toBe(base)
    expect(signedContent('Abnahme', [{ ...fields[1], label: 'Objekt' }, ...fields.slice(2)], values, ['A'])).not.toBe(base)
  })
})

describe('displayValue', () => {
  const words = { yes: 'Ja', no: 'Nein' }
  const day = (iso: string) => iso.split('-').reverse().join('.')

  it('puts a value the way paper shows it', () => {
    expect(displayValue(fields[4], true, words, day)).toBe('Ja')
    expect(displayValue(fields[4], undefined, words, day)).toBe('Nein')
    expect(displayValue(fields[2], '2026-09-21', words, day)).toBe('21.09.2026')
    expect(displayValue(fields[2], '', words, day)).toBe('')
    expect(displayValue(fields[1], 'Musterhaus', words, day)).toBe('Musterhaus')
  })
})

describe('signatureBase64', () => {
  it('takes a PNG data URL and nothing else', () => {
    const png = `data:image/png;base64,${'A'.repeat(200)}`
    expect(signatureBase64(png)).toBe('A'.repeat(200))
    expect(signatureBase64(`data:image/jpeg;base64,${'A'.repeat(200)}`)).toBeNull()
    expect(signatureBase64('data:image/png;base64,AAAA')).toBeNull()
    expect(signatureBase64(`data:image/png;base64,${'A'.repeat(500_000)}`)).toBeNull()
    expect(signatureBase64(null)).toBeNull()
  })
})

describe('the acceptance protocol every installation starts with', () => {
  it('passes its own rules unchanged', () => {
    expect(parseFields(ACCEPTANCE_PROTOCOL.fields)).toEqual(ACCEPTANCE_PROTOCOL.fields)
    expect(parseSigners(ACCEPTANCE_PROTOCOL.signers)).toEqual(ACCEPTANCE_PROTOCOL.signers)
  })
})

describe('the newer kinds of field — number, several answers, a table, photos', () => {
  const fields: FormField[] = [
    { id: 'qty', type: 'number', label: 'Menge' },
    { id: 'trades', type: 'multi', label: 'Gewerke', options: ['Malern', 'Spachteln', 'Trockenbau'], required: true },
    { id: 'rooms', type: 'table', label: 'Räume', options: ['Raum', 'Fläche', 'Bemerkung'] },
    { id: 'pics', type: 'photo', label: 'Fotos' },
  ]

  it('wants answers for a multi and columns for a table, six at most, and no prefill for them', () => {
    expect(parseFields([{ type: 'multi', label: 'Gewerke', options: [] }])).toEqual([])
    expect(parseFields([{ type: 'table', label: 'Räume', options: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }])[0].options).toHaveLength(6)
    expect(parseFields([{ type: 'number', label: 'Menge', prefill: 'today' }])[0]).toEqual({ id: 'f1', type: 'number', label: 'Menge' })
    expect(parseFields([{ type: 'photo', label: 'Fotos', options: ['x'] }])[0]).toEqual({ id: 'f1', type: 'photo', label: 'Fotos' })
  })

  it('starts them empty', () => {
    expect(prefillValues(fields, {})).toEqual({ qty: '', trades: [], rooms: [], pics: [] })
  })

  it('takes a number as it is typed, in German or English, and nothing else', () => {
    expect(cleanValues(fields, { qty: '12,5' }).qty).toBe('12,5')
    expect(cleanValues(fields, { qty: '1.250,50' }).qty).toBe('1.250,50')
    expect(cleanValues(fields, { qty: ' -3 ' }).qty).toBe('-3')
    expect(cleanValues(fields, { qty: '0.75' }).qty).toBe('0.75')
    expect(cleanValues(fields, { qty: 'zwölf' }).qty).toBe('')
    expect(cleanValues(fields, { qty: '12,5 m²' }).qty).toBe('')
  })

  it('keeps the chosen answers in the order the template names them, known ones only', () => {
    expect(cleanValues(fields, { trades: ['Trockenbau', 'Malern', 'Dach'] }).trades).toEqual(['Malern', 'Trockenbau'])
    expect(cleanValues(fields, { trades: 'Malern' }).trades).toEqual([])
  })

  it('holds a table to its columns and drops a row nobody wrote into', () => {
    expect(cleanValues(fields, { rooms: [['Bad', '12', 'Decke', 'zu viel'], ['', '', ''], ['Küche']] }).rooms).toEqual([
      ['Bad', '12', 'Decke'],
      ['Küche', '', ''],
    ])
    expect(cleanValues(fields, { rooms: 'Bad' }).rooms).toEqual([])
  })

  it('keeps the photos as their documents\' ids, each once, twelve at most', () => {
    expect(cleanValues(fields, { pics: ['cmabc1234567890', 'cmabc1234567890', '../x', 42] }).pics).toEqual(['cmabc1234567890'])
    const many = Array.from({ length: 15 }, (_, i) => `cmphoto${String(i).padStart(8, '0')}`)
    expect(cleanValues(fields, { pics: many }).pics).toHaveLength(12)
  })

  it('counts an empty list as missing when the field is required', () => {
    expect(missingRequired(fields, { qty: '', trades: [], rooms: [], pics: [] }).map((f) => f.id)).toEqual(['trades'])
    expect(missingRequired(fields, { qty: '', trades: ['Spachteln'], rooms: [], pics: [] })).toEqual([])
  })

  it('shows several answers as a list and says how many rows or photos there are', () => {
    const day = (iso: string) => iso
    expect(displayValue(fields[1], ['Malern', 'Spachteln'], { yes: 'Ja', no: 'Nein' }, day)).toBe('Malern, Spachteln')
    expect(displayValue(fields[2], [['a', 'b', 'c']], { yes: 'Ja', no: 'Nein', rows: (n) => `${n} Zeilen` }, day)).toBe('1 Zeilen')
    expect(displayValue(fields[3], ['x', 'y'], { yes: 'Ja', no: 'Nein', photos: (n) => `${n} Fotos` }, day)).toBe('2 Fotos')
  })

  it('signs the lists as they stand', () => {
    const a = signedContent('T', fields, { qty: '1', trades: ['Malern'], rooms: [['Bad', '', '']], pics: ['cmabc1234567890'] }, [])
    const b = signedContent('T', fields, { qty: '1', trades: ['Malern'], rooms: [['Bad', '', 'x']], pics: ['cmabc1234567890'] }, [])
    expect(a).not.toBe(b)
    expect(signedContent('T', fields, {}, [])).toContain('["qty","number","Menge",""],["trades","multi","Gewerke",[]]')
  })
})

describe('badNumbers', () => {
  const fields: FormField[] = [
    { id: 'qty', type: 'number', label: 'Menge' },
    { id: 'area', type: 'number', label: 'Fläche' },
    { id: 'note', type: 'text', label: 'Notiz' },
  ]

  it('names the number fields holding something that is no number, so it is not emptied silently', () => {
    expect(badNumbers(fields, { qty: '12 m²', area: 'ca. 4', note: 'frei' })).toEqual(['Menge', 'Fläche'])
  })

  it('lets numbers and empty fields pass', () => {
    expect(badNumbers(fields, { qty: '1.250,5', area: '' })).toEqual([])
    expect(badNumbers(fields, null)).toEqual([])
  })
})

describe('what printed forms need — fixed texts, words after a value, fixed rows, placed signatures', () => {
  const sheet: FormField[] = parseFields([
    { id: 'intro', type: 'info', label: '', body: 'Musterbedingungen\r\n• erster Punkt\n• zwei\u00adter Punkt' },
    { id: 'h', type: 'heading', label: '1. Abnahme' },
    { id: 'how', type: 'choice', label: '', options: ['ohne Vorbehalte', 'mit Vorbehalten'], required: true },
    { id: 'start', type: 'date', label: 'Der Baubeginn wird am', suffix: 'erfolgen.', prefill: 'plannedStart' },
    { id: 'startText', type: 'text', label: 'Beginn', prefill: 'plannedStart' },
    { id: 'company', type: 'longtext', label: 'Auftragnehmer:', defaultValue: 'Muster Maler GmbH\nBeispielweg 1', half: true },
    { id: 'customer', type: 'longtext', label: 'Auftraggeber:', prefill: 'customerWithAddress', half: true },
    { id: 'oneLine', type: 'text', label: 'Anschrift', prefill: 'customerWithAddress' },
    { id: 'trades', type: 'multi', label: 'Gewerk:', options: ['Maler', 'Trockenbau', 'Innenputz'], prefill: 'workTypes' },
    {
      id: 'steps',
      type: 'table',
      label: 'Ablauf',
      options: ['Schritt', 'Maßnahme', 'Erledigt'],
      rows: [
        ['Beginn', 'auf 25 °C', ''],
        ['Ende', 'abgestellt', '', 'zu viel'],
      ],
      widths: [3, 3, 2],
      required: true,
    },
    { id: 'defects', type: 'table', label: 'Mängel', options: ['Mangel', 'Termin'], prefill: 'openDefects' },
    { id: 'signHere', type: 'signatures', label: '', options: ['Auftragnehmer', 'Niemand'] },
    { id: 'page', type: 'pagebreak', label: '' },
  ])
  const context = {
    plannedStart: '2026-11-03',
    customerWithAddress: 'Max Mustermann\nMusterstraße 1\n12345 Musterstadt',
    workTypes: 'malern, Fassade, Putz',
    openDefects: '– Riss im Putz (Flur)\n– Farbnase (Bad)',
  }

  it('keeps the new kinds and their words, and needs no label where none is printed', () => {
    expect(sheet.map((f) => f.id)).toEqual(['intro', 'h', 'how', 'start', 'startText', 'company', 'customer', 'oneLine', 'trades', 'steps', 'defects', 'signHere', 'page'])
    // Line ends kept, the soft hyphen of a word processor gone.
    expect(sheet[0].body).toBe('Musterbedingungen\n• erster Punkt\n• zweiter Punkt')
    expect(sheet[3]).toMatchObject({ suffix: 'erfolgen.', prefill: 'plannedStart' })
    expect(sheet[5]).toMatchObject({ half: true, defaultValue: 'Muster Maler GmbH\nBeispielweg 1' })
    // A fixed row holds its columns, no more.
    expect(sheet[9].rows).toEqual([
      ['Beginn', 'auf 25 °C', ''],
      ['Ende', 'abgestellt', ''],
    ])
    expect(sheet[9].widths).toEqual([3, 3, 2])
    expect(sheet[11].options).toEqual(['Auftragnehmer', 'Niemand'])
  })

  it('drops what a kind cannot have', () => {
    expect(parseFields([{ type: 'info', label: '', body: '' }])).toEqual([])
    expect(parseFields([{ type: 'text', label: '' }])).toEqual([])
    // A blank the words after it name needs no label: "____ Euro netto".
    expect(parseFields([{ type: 'number', label: '', suffix: 'Euro netto' }])[0]).toEqual({ id: 'f1', type: 'number', label: '', suffix: 'Euro netto' })
    expect(parseFields([{ type: 'checkbox', label: 'Besenrein', suffix: 'x', defaultValue: 'y', prefill: 'today' }])[0]).toEqual({
      id: 'f1',
      type: 'checkbox',
      label: 'Besenrein',
    })
    expect(parseFields([{ type: 'info', label: 'T', body: 'x', required: true, half: true }])[0]).toEqual({ id: 'f1', type: 'info', label: 'T', body: 'x' })
    // A default a choice cannot hold is no default; widths all the same say nothing.
    expect(parseFields([{ type: 'choice', label: 'E', options: ['a', 'b'], defaultValue: 'c' }])[0].defaultValue).toBeUndefined()
    expect(parseFields([{ type: 'table', label: 'T', options: ['a', 'b'], widths: [1, 1] }])[0].widths).toBeUndefined()
  })

  it('starts with what the project knows, a day written the German way in a text, several lines as one in a short field', () => {
    const values = prefillValues(sheet, context)
    expect(values.start).toBe('2026-11-03')
    expect(values.startText).toBe('03.11.2026')
    expect(values.company).toBe('Muster Maler GmbH\nBeispielweg 1')
    expect(values.customer).toBe('Max Mustermann\nMusterstraße 1\n12345 Musterstadt')
    expect(values.oneLine).toBe('Max Mustermann, Musterstraße 1, 12345 Musterstadt')
    // The project's trades ticked among the answers, whatever their case.
    expect(values.trades).toEqual(['Maler'])
    expect(values.steps).toEqual([
      ['Beginn', 'auf 25 °C', ''],
      ['Ende', 'abgestellt', ''],
    ])
    expect(values.defects).toEqual([
      ['Riss im Putz (Flur)', ''],
      ['Farbnase (Bad)', ''],
    ])
    expect(Object.keys(values)).not.toContain('intro')
    expect(Object.keys(values)).not.toContain('signHere')
  })

  it('keeps a fixed table to its rows and its words, whatever is sent', () => {
    const values = cleanValues(sheet, { steps: [['Anders', 'x', '01.11. 8:00 MM'], [], ['zu', 'viele', 'Zeilen']] })
    expect(values.steps).toEqual([
      ['Beginn', 'auf 25 °C', '01.11. 8:00 MM'],
      ['Ende', 'abgestellt', ''],
    ])
    expect(cleanValues(sheet, null).steps).toEqual([
      ['Beginn', 'auf 25 °C', ''],
      ['Ende', 'abgestellt', ''],
    ])
  })

  it('counts a fixed table as empty until one of its gaps is filled, and names an unnamed choice by its heading', () => {
    const empty = cleanValues(sheet, {})
    expect(missingRequired(sheet, empty).map((f) => f.id)).toEqual(['how', 'steps'])
    const filled = cleanValues(sheet, { how: 'ohne Vorbehalte', steps: [['', '', 'erledigt']] })
    expect(missingRequired(sheet, filled)).toEqual([])
    expect(fieldName(sheet, sheet[2])).toBe('1. Abnahme')
    expect(fieldName(sheet, sheet[3])).toBe('Der Baubeginn wird am')
  })

  it('places each signer once: where a block names them, the rest where a block names nobody, or at the end', () => {
    const signers = ['Auftragnehmer', 'Auftraggeber', 'Zeuge']
    expect(Object.fromEntries(signaturePlaces(sheet, signers))).toEqual({ signHere: [0], end: [1, 2] })
    const two = parseFields([
      { id: 'a', type: 'signatures', label: '' },
      { id: 'b', type: 'signatures', label: '', options: ['Zeuge'] },
    ])
    expect(Object.fromEntries(signaturePlaces(two, signers))).toEqual({ a: [0, 1], b: [2], end: [] })
    expect(Object.fromEntries(signaturePlaces([], signers))).toEqual({ end: [0, 1, 2] })
  })

  it('signs the words around the values too — and a form without them exactly as before', () => {
    const values = prefillValues(sheet, context)
    const base = signedContent('Vertrag', sheet, values, ['A'])
    const changed = (patch: Partial<FormField>, at: number) => signedContent('Vertrag', sheet.map((f, i) => (i === at ? { ...f, ...patch } : f)), values, ['A'])
    expect(changed({ body: 'Andere Bedingungen' }, 0)).not.toBe(base)
    expect(changed({ suffix: 'beginnen.' }, 3)).not.toBe(base)
    expect(changed({ rows: [['Beginn', 'auf 30 °C', ''], ['Ende', 'abgestellt', '']] }, 9)).not.toBe(base)
    // A field of the old kinds signs as it always has: the digest of a form signed before is unchanged.
    expect(signedContent('T', [{ id: 'x', type: 'text', label: 'X' }], { x: 'y' }, [])).toBe('{"title":"T","fields":[["x","text","X","y"]],"signers":[]}')
  })

  it('writes a day the German way', () => {
    expect(germanDay('2026-11-03')).toBe('03.11.2026')
    expect(germanDay('morgen')).toBe('morgen')
  })
})
