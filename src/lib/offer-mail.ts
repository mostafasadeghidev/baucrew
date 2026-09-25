/**
 * The e-mail that goes with an offer, prepared — never sent. When a project
 * stands at "Angebot erstellt", the office opens a draft in its own mail
 * program with one click: the customer's address, a subject with the offer's
 * number, a short letter with the sum. The office reads it, attaches the
 * offer and sends it — the client asked for exactly that: a draft to review,
 * nothing that goes out by itself.
 *
 * The words come in as a function, so the letter is tested without
 * translations and can be written in German whatever language the office
 * has the app in — the customer reads German.
 */

export type OfferMailWords = {
  subject: (v: { number: string; name: string }) => string
  greetingNamed: (v: { name: string }) => string
  greeting: () => string
  body: (v: { number: string; name: string }) => string
  amount: (v: { amount: string }) => string
  closing: (v: { company: string }) => string
}

export type OfferMailInput = {
  number: string
  name: string
  /** The person the offer is addressed to, when the customer has one. */
  contactPerson: string | null
  /** The order value, already written as money — null when there is none or it is not to be shown. */
  amount: string | null
  company: string
}

export type OfferMail = { subject: string; body: string }

export function offerMailDraft(input: OfferMailInput, words: OfferMailWords): OfferMail {
  const contact = input.contactPerson?.trim()
  const lines = [
    contact ? words.greetingNamed({ name: contact }) : words.greeting(),
    '',
    words.body({ number: input.number, name: input.name }),
  ]
  if (input.amount) lines.push('', words.amount({ amount: input.amount }))
  lines.push('', words.closing({ company: input.company }))
  return { subject: words.subject({ number: input.number, name: input.name }), body: lines.join('\n') }
}

/**
 * The `mailto:` link that opens the draft in the mail program. Line breaks
 * go as CRLF, which is what mail programs expect in a mailto body; without
 * an address the draft opens with the recipient left to fill in.
 */
export function mailtoHref(to: string | null, mail: OfferMail): string {
  const params = new URLSearchParams({ subject: mail.subject, body: mail.body.replace(/\n/g, '\r\n') })
  // URLSearchParams writes a space as "+", which a mail program shows as a plus.
  const query = params.toString().replace(/\+/g, '%20')
  return `mailto:${to ? encodeURIComponent(to.trim()) : ''}?${query}`
}
