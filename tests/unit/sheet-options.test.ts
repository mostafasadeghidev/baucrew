import { describe, expect, it } from 'vitest'
import { parseSheetOptions, sheetDefaults, sheetOptionsQuery } from '@/lib/sheet-options'

const known = { types: ['malern', 'putz', 'trockenbau'], clientTypes: ['PRIVATE', 'BUSINESS'], buildingTypes: ['NEW', 'OLD'] }
const own = { types: ['malern', 'putz'], clientType: 'PRIVATE', buildingType: null }

describe('sheetDefaults', () => {
  it("keeps the project's values only where the lists still offer them", () => {
    expect(sheetDefaults({ types: ['malern', 'alt'], clientType: 'GONE', buildingType: 'OLD' }, known)).toEqual({
      types: ['malern'],
      clientType: null,
      buildingType: 'OLD',
    })
  })
})

describe('parseSheetOptions', () => {
  it("ticks the project's own work types and set-up and leaves the notes box empty unless asked", () => {
    expect(parseSheetOptions({}, own, known)).toEqual({ types: ['malern', 'putz'], clientType: 'PRIVATE', buildingType: null, notes: false })
  })

  it('ticks exactly what the address names — none, when it names none', () => {
    expect(parseSheetOptions({ types: 'trockenbau,unbekannt', client: 'BUSINESS', building: 'NEW', notes: '1' }, own, known)).toEqual({
      types: ['trockenbau'],
      clientType: 'BUSINESS',
      buildingType: 'NEW',
      notes: true,
    })
    expect(parseSheetOptions({ types: '', client: '' }, own, known)).toMatchObject({ types: [], clientType: null })
  })

  it('ignores a value the lists do not offer', () => {
    expect(parseSheetOptions({ client: 'GONE', building: 'GONE' }, own, known)).toMatchObject({ clientType: null, buildingType: null })
  })
})

describe('sheetOptionsQuery', () => {
  it('writes nothing for the defaults', () => {
    expect(sheetOptionsQuery({ types: ['putz', 'malern'], clientType: 'PRIVATE', buildingType: null, notes: false }, own)).toEqual({})
  })

  it('writes what differs — an untick as an empty value', () => {
    expect(sheetOptionsQuery({ types: ['malern'], clientType: null, buildingType: 'NEW', notes: true }, own)).toEqual({
      types: 'malern',
      client: '',
      building: 'NEW',
      notes: '1',
    })
    expect(sheetOptionsQuery({ types: [], clientType: 'PRIVATE', buildingType: null, notes: false }, own)).toEqual({ types: '' })
  })
})
