import { describe, expect, it } from 'vitest'
import {
  ACCEPTANCE_PROTOCOL,
  cleanValues,
  displayValue,
  formStatus,
  missingRequired,
  parseFields,
  parseSigners,
  prefillValues,
  signatureBase64,
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
