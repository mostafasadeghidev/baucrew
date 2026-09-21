import { describe, expect, it } from 'vitest'
import { parseSheetOptions, sheetOptionsQuery } from '@/lib/sheet-options'

const known = ['malern', 'putz', 'trockenbau']
const own = ['malern', 'putz']

describe('parseSheetOptions', () => {
  it('ticks the project\'s own work types and leaves the notes box empty unless asked', () => {
    expect(parseSheetOptions({}, own, known)).toEqual({ types: ['malern', 'putz'], only: false, notes: false })
  })

  it('ticks exactly what the address names — none, when it names none', () => {
    expect(parseSheetOptions({ types: 'trockenbau,unbekannt', only: '1', notes: '1' }, own, known)).toEqual({
      types: ['trockenbau'],
      only: true,
      notes: true,
    })
    expect(parseSheetOptions({ types: '' }, own, known).types).toEqual([])
  })

  it('drops a work type the project has that is no longer offered', () => {
    expect(parseSheetOptions({}, ['malern', 'alt'], known).types).toEqual(['malern'])
  })
})

describe('sheetOptionsQuery', () => {
  it('writes nothing for the defaults', () => {
    expect(sheetOptionsQuery({ types: ['putz', 'malern'], only: false, notes: false }, own)).toEqual({})
  })

  it('writes what differs', () => {
    expect(sheetOptionsQuery({ types: ['malern'], only: true, notes: true }, own)).toEqual({ types: 'malern', only: '1', notes: '1' })
    expect(sheetOptionsQuery({ types: [], only: false, notes: false }, own)).toEqual({ types: '' })
  })
})
