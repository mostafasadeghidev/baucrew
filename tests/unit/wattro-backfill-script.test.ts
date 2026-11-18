import { describe, expect, it } from 'vitest'
import { toWattroProject, shouldCreateInWattro, PUSH_STATUSES } from '@/lib/wattro/projects'
// The one-off backfill script is plain Node (it runs inside the production
// container), so its field rules are a copy of src/lib/wattro/projects.ts —
// this test keeps the two the same.
import * as script from '../../scripts/wattro-backfill-projects.mjs'

const project = (over: Record<string, unknown> = {}) => ({
  number: '2026-0804',
  jobNumber: null as string | null,
  name: 'Muster Fassade Beispielweg 3',
  status: 'IN_PROGRESS',
  archivedAt: null as Date | null,
  street: 'Beispielweg 3',
  postalCode: '12345',
  city: 'Musterstadt',
  phone: '0123 456789',
  contact: 'Frau Muster',
  ...over,
})

describe('backfill script: same field rules as the app\'s push', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['a plain project', {}],
    ['with a Projektnummer', { jobNumber: '1234567' }],
    ['no address, phone or contact', { street: null, postalCode: null, city: null, phone: null, contact: null }],
    ['only a town', { street: null, postalCode: null }],
    ['a phone that is too long', { phone: '+49 123 4567890 12345 67' }],
    ['a very long name', { name: 'x'.repeat(250) }],
    ['an empty name', { name: '   ' }],
    ['messy whitespace', { contact: '  Frau   Muster ', street: ' Beispielweg   3 ' }],
    ['a completed project', { status: 'COMPLETED' }],
    ['an archived project', { archivedAt: new Date() }],
  ]
  it.each(cases)('builds the same body for %s', (_label, over) => {
    const p = project(over)
    expect(script.toBody(p)).toEqual(toWattroProject(p))
  })

  it('creates the same statuses the push creates', () => {
    expect([...script.PUSH_STATUSES]).toEqual([...PUSH_STATUSES])
    for (const status of ['LEAD', 'QUOTED', 'APPROVED', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'PAID', 'CANCELLED']) {
      for (const archivedAt of [null, new Date()]) {
        const p = project({ status, archivedAt })
        expect(script.shouldCreate(p)).toBe(shouldCreateInWattro(p))
      }
    }
  })
})

describe('backfill script: possible duplicates', () => {
  const wattro = [
    { id: 1, human_id: 'P45', name: 'Muster Erika' },
    { id: 2, human_id: 'P63', name: 'Beispiel Umbau Musterstadt' },
    { id: 3, human_id: 'P7', name: 'Probe' },
  ]

  it('finds the same name, whatever the case and the number in brackets', () => {
    expect(script.similarInWattro('muster ERIKA (1234567)', wattro).map((w: { id: number }) => w.id)).toEqual([1])
  })

  it('finds a project that shares two words of the name', () => {
    expect(script.similarInWattro('Beispiel Musterstadt Malerarbeiten', wattro).map((w: { id: number }) => w.id)).toEqual([2])
  })

  it('does not call a single shared word a duplicate', () => {
    expect(script.similarInWattro('Beispiel Haus', wattro)).toEqual([])
  })

  it('finds nothing for a new name', () => {
    expect(script.similarInWattro('Vorlage Neubau Musterstadt', wattro)).toEqual([])
  })
})

describe('backfill script: arguments and limits', () => {
  it('writes nothing unless --apply is given', () => {
    expect(script.parseArgs(['--keys=a,b'])).toEqual({ keys: ['a', 'b'], apply: false, allowSimilar: false })
    expect(script.parseArgs(['--keys=a', '--apply'])).toEqual({ keys: ['a'], apply: true, allowSimilar: false })
  })

  it('tidies the list: spaces, empties and repeats', () => {
    expect(script.parseArgs(['--keys= a, ,b,a,'])).toEqual({ keys: ['a', 'b'], apply: false, allowSimilar: false })
  })

  it('has no keys when none are given', () => {
    expect(script.parseArgs([])).toEqual({ keys: [], apply: false, allowSimilar: false })
  })

  it('sends a look-alike only when told to', () => {
    expect(script.parseArgs(['--keys=a']).allowSimilar).toBe(false)
    expect(script.parseArgs(['--keys=a', '--allow-similar'])).toEqual({ keys: ['a'], apply: false, allowSimilar: true })
  })

  it('caps one run at 15 projects', () => {
    expect(script.MAX_KEYS).toBe(15)
  })
})
