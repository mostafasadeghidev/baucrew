import { describe, expect, it } from 'vitest'
import { mailtoHref, offerMailDraft, type OfferMailWords } from '@/lib/offer-mail'

const words: OfferMailWords = {
  subject: ({ number, name }) => `Angebot ${number} – ${name}`,
  greetingNamed: ({ name }) => `Guten Tag ${name},`,
  greeting: () => 'Sehr geehrte Damen und Herren,',
  body: ({ number }) => `anbei unser Angebot ${number}.`,
  amount: ({ amount }) => `Summe: ${amount}`,
  closing: ({ company }) => `Mit freundlichen Grüßen\n${company}`,
}

describe('offerMailDraft', () => {
  it('writes the letter: the greeting by name, the body, the sum, the closing', () => {
    const mail = offerMailDraft(
      { number: '2026-0001', name: 'Musterstraße 12, Fassade', contactPerson: 'Erika Beispiel', amount: '12.500,00 €', company: 'Muster GmbH' },
      words
    )
    expect(mail.subject).toBe('Angebot 2026-0001 – Musterstraße 12, Fassade')
    expect(mail.body).toBe(
      ['Guten Tag Erika Beispiel,', '', 'anbei unser Angebot 2026-0001.', '', 'Summe: 12.500,00 €', '', 'Mit freundlichen Grüßen', 'Muster GmbH'].join('\n')
    )
  })

  it('greets generally without a contact, and leaves the sum out when there is none to show', () => {
    const mail = offerMailDraft({ number: '2026-0002', name: 'Halle', contactPerson: '  ', amount: null, company: 'Muster GmbH' }, words)
    expect(mail.body.startsWith('Sehr geehrte Damen und Herren,')).toBe(true)
    expect(mail.body).not.toContain('Summe')
  })
})

describe('mailtoHref', () => {
  it('addresses the customer, breaks lines the way mail programs read them, and never writes a plus for a space', () => {
    const href = mailtoHref('info@muster.example', { subject: 'Angebot 1 – Halle', body: 'Zeile 1\nZeile 2' })
    expect(href.startsWith('mailto:info%40muster.example?')).toBe(true)
    expect(href).toContain('subject=Angebot%201%20%E2%80%93%20Halle')
    expect(href).toContain('body=Zeile%201%0D%0AZeile%202')
    expect(href).not.toContain('+')
  })

  it('opens without a recipient when the customer has no address', () => {
    expect(mailtoHref(null, { subject: 'A', body: 'B' })).toBe('mailto:?subject=A&body=B')
  })
})
