import { describe, expect, it } from 'vitest'
import { formerTitle, isWork, projectTitle, TITLE_MAX } from '@/lib/project-title'

describe('projectTitle', () => {
  it('is the customer followed by the trade', () => {
    expect(projectTitle({ customer: 'Muster GmbH', trades: ['Malern'] })).toBe('Muster GmbH · Malern')
    expect(projectTitle({ customer: ' Muster GmbH ', trades: ['Trockenbau '] })).toBe('Muster GmbH · Trockenbau')
  })

  it('names several trades one after the other, each once', () => {
    expect(projectTitle({ customer: 'Muster GmbH', trades: ['Malern', 'Trockenbau', 'Malern'] })).toBe('Muster GmbH · Malern, Trockenbau')
  })

  it('wins over the old title once a trade is set', () => {
    expect(projectTitle({ customer: 'Beispiel', trades: ['Putz'], sourceTitle: 'Beispiel Fassade Musterstadt' })).toBe('Beispiel · Putz')
  })

  it('keeps the old title while there is no trade, else the customer alone', () => {
    expect(projectTitle({ customer: 'Beispiel', trades: [], sourceTitle: 'Beispiel Fassade Musterstadt' })).toBe('Beispiel Fassade Musterstadt')
    expect(projectTitle({ customer: 'Beispiel', trades: [' '], sourceTitle: '  ' })).toBe('Beispiel')
    expect(projectTitle({ customer: 'Beispiel', trades: [], sourceTitle: null })).toBe('Beispiel')
  })

  it('names the work note after the trades, or alone', () => {
    expect(projectTitle({ customer: 'Muster GmbH', trades: ['Malern'], workNote: 'Küche' })).toBe('Muster GmbH · Malern, Küche')
    expect(projectTitle({ customer: 'Muster GmbH', trades: [], workNote: ' Küche  und Flur ', sourceTitle: 'Alt' })).toBe('Muster GmbH · Küche und Flur')
    expect(projectTitle({ customer: 'Muster GmbH', trades: [], workNote: '  ', sourceTitle: 'Muster Treppenhaus' })).toBe('Muster Treppenhaus')
  })

  it('is never named after what is no work on a site', () => {
    const office = ['Lead Anzeige', 'Kundengewinnung (SM)', 'Kundengewinnung (B2B)', 'Mitarbeitergewinnung', 'Systematisierung', 'Beispiele/Inspirationen (Teilnehmer Edition)']
    expect(projectTitle({ customer: 'Muster GmbH', trades: ['Malern', ...office] })).toBe('Muster GmbH · Malern')
    expect(projectTitle({ customer: 'Muster GmbH', trades: office, sourceTitle: 'Muster Kampagne' })).toBe('Muster Kampagne')
    expect(projectTitle({ customer: 'Muster GmbH', trades: ['Lead Anzeige'], workNote: 'Küche' })).toBe('Muster GmbH · Küche')
    expect(projectTitle({ customer: 'Muster GmbH', trades: [], workNote: 'Lead Anzeige', sourceTitle: 'Muster Lead' })).toBe('Muster Lead')
  })

  it('counts every trade of a site as work', () => {
    const site = ['Malern', 'Gestaltung / Technik', 'Putz', 'Trockenbau', 'Lackierarbeiten', 'Abbruch', 'Bodenbeläge', 'Außenfassade', 'WDVS', 'Renovierung', 'Individuell', 'Gerüstbau', 'Fugenloses Bad']
    expect(site.filter((t) => !isWork(t))).toEqual([])
  })

  it('does without a customer name', () => {
    expect(projectTitle({ customer: '', trades: ['Malern'] })).toBe('Malern')
  })

  it('stays within what the name holds', () => {
    expect(projectTitle({ customer: 'M'.repeat(400), trades: ['Malern'] })).toHaveLength(TITLE_MAX)
  })
})

describe('formerTitle', () => {
  it('is the old title while it differs from the title shown', () => {
    expect(formerTitle('Beispiel · Putz', 'Beispiel Fassade Musterstadt')).toBe('Beispiel Fassade Musterstadt')
    expect(formerTitle('Beispiel Fassade Musterstadt', ' Beispiel Fassade Musterstadt ')).toBeNull()
    expect(formerTitle('Beispiel · Putz', null)).toBeNull()
    expect(formerTitle('Beispiel · Putz', '')).toBeNull()
  })
})
