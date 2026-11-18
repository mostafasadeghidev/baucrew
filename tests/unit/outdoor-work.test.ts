import { describe, expect, it } from 'vitest'
import { facadeWord, mayBeOutside, outdoorWork, type OutdoorInput } from '@/lib/outdoor-work'

const trade = (nameDe: string, outdoor = false) => ({ workCategory: { outdoor, nameDe, nameEn: nameDe } })
const job = (over: Partial<OutdoorInput>): OutdoorInput => ({ workCategories: [trade('Putz')], ...over })

describe('facadeWord', () => {
  it.each([
    ['Fassade streichen', 'Fassade'],
    ['Ausbesserungsarbeiten an Fassade', 'Fassade'],
    ['Muster Weg 3, Westfassade Anbau', 'Westfassade'],
    ['Gesamtfassadenfläche ca. 350 m²', 'Gesamtfassadenfläche'],
    ['BV: Außenputz Neubau', 'Außenputz'],
    ['die nächste Anfrage ist der AUßENPUTZ', 'AUßENPUTZ'],
    ['Innen- und Aussenputzarbeiten', 'Aussenputzarbeiten'],
    ['Musterhalle Außenanstrich', 'Außenanstrich'],
    ['Malerarbeiten im Außenbereich', 'Außenbereich'],
    ['2183469 = Außen- und Innenputz', 'Außen- und Innenputz'],
    ['verputzen einer Garage innen und außen', 'innen und außen'],
  ])('finds the outside in %j', (text, word) => {
    expect(facadeWord(text)).toBe(word)
  })

  it.each([
    'Innenputz und Malerarbeiten',
    'Rollos wurden nach außen versetzt',
    'in den Außenecken eine Innendämmung',
    'Außenwand zum Balkon und Küchenfenster',
    'Spachteln, Tapezieren, Streichen',
    '',
  ])('finds nothing in %j', (text) => {
    expect(facadeWord(text)).toBeNull()
  })

  it('takes the first one in the text', () => {
    expect(facadeWord('Außenputz, danach Fassade streichen')).toBe('Außenputz')
  })
})

describe('mayBeOutside', () => {
  it('is plaster, paint and lacquer, by the start of the name', () => {
    expect(mayBeOutside({ nameDe: 'Putz' })).toBe(true)
    expect(mayBeOutside({ nameDe: 'Malern' })).toBe(true)
    expect(mayBeOutside({ nameDe: 'Malerarbeiten' })).toBe(true)
    expect(mayBeOutside({ nameDe: 'Lackierarbeiten' })).toBe(true)
    expect(mayBeOutside({ nameDe: 'Beispielgewerk', nameEn: 'Painting' })).toBe(true)
    expect(mayBeOutside({ nameDe: 'Trockenbau', nameEn: 'Drywall' })).toBe(false)
    expect(mayBeOutside({ nameDe: 'Fugenloses Bad' })).toBe(false)
  })
})

describe('outdoorWork', () => {
  it('is outdoor by a ticked trade, whatever the words say', () => {
    expect(outdoorWork({ workCategories: [trade('Außenfassade', true)] })).toEqual({ by: 'trade' })
  })

  it('reads the work note, then the original title, then the description', () => {
    expect(outdoorWork(job({ workNote: 'Fassade Nordseite', sourceTitle: 'Muster Außenputz', description: 'Außenanstrich' }))).toEqual({
      by: 'text',
      field: 'workNote',
      word: 'Fassade',
    })
    expect(outdoorWork(job({ sourceTitle: 'Muster GmbH Außenputz', description: 'Fassade' }))).toEqual({
      by: 'text',
      field: 'sourceTitle',
      word: 'Außenputz',
    })
    expect(outdoorWork(job({ description: 'Art der Arbeiten: Malerarbeiten, Außenputz' }))).toEqual({
      by: 'text',
      field: 'description',
      word: 'Außenputz',
    })
  })

  it('reads the card\'s "Art der Arbeit" as written, where "AP" alone is Außenputz', () => {
    expect(outdoorWork(job({ workTypeText: 'Innenputz, Außenputz', sourceTitle: 'Muster' }))).toEqual({
      by: 'text',
      field: 'workTypeText',
      word: 'Außenputz',
    })
    expect(outdoorWork(job({ workTypeText: 'IP, AP' }))).toEqual({ by: 'text', field: 'workTypeText', word: 'AP' })
    expect(outdoorWork(job({ workTypeText: 'ap' }))).toEqual({ by: 'text', field: 'workTypeText', word: 'ap' })
    expect(outdoorWork(job({ workTypeText: 'IP' }))).toBeNull()
    expect(outdoorWork(job({ workTypeText: 'Kapputzen' }))).toBeNull()
    // Two letters elsewhere say too little.
    expect(outdoorWork(job({ description: 'AP' }))).toBeNull()
  })

  it('does not read the words of an indoor trade', () => {
    expect(outdoorWork({ workCategories: [trade('Trockenbau')], description: 'Gerüst an der Fassade steht' })).toBeNull()
  })

  it('is nothing for a plaster job without facade words, or a job without trades', () => {
    expect(outdoorWork(job({ description: 'Innenputz EG', workNote: null }))).toBeNull()
    expect(outdoorWork({ workCategories: [], description: 'Fassade streichen' })).toBeNull()
  })
})
