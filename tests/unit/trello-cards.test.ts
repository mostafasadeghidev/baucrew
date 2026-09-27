import { describe, expect, it } from 'vitest'
import { CARD_FIELDS, CARD_FIELD_TONE, cardFieldLines } from '@/lib/board-cards'
import { ACCEPT_UPLOADS, resolveUploadType, validateUpload } from '@/lib/files'
import { REACTIONS, canDeleteComment, canEditComment, isReaction, reactionSummary } from '@/lib/comments'

describe('cardFieldLines', () => {
  it('keeps the order of the client\'s Trello cards, whatever order the values come in', () => {
    const lines = cardFieldLines({
      customerNumber: '10001',
      created: '29.05.2026',
      inspection: '08.07.2026',
      wish: 'Frühjahr 2027',
      workType: 'Fassade WDVS',
      value: '61.000 €',
      address: 'Musterweg 1, 12345 Musterstadt',
      customer: 'Max Muster',
    })
    expect(lines.map((l) => l.key)).toEqual([...CARD_FIELDS])
  })

  it('leaves out what is empty rather than drawing a dash — and a price nobody may see', () => {
    const lines = cardFieldLines({ customer: 'Muster GmbH', address: '  ', value: null, wish: undefined, customerNumber: '10002' })
    expect(lines).toEqual([
      { key: 'customer', text: 'Muster GmbH' },
      { key: 'customerNumber', text: '10002' },
    ])
  })

  it('colours the order value, the site visit and the day the card came in, as Trello does', () => {
    expect(CARD_FIELD_TONE).toEqual({ value: 'green', inspection: 'lime', created: 'red' })
  })
})

describe('uploads of e-mails', () => {
  it('takes an Outlook e-mail whose type the browser did not know', () => {
    expect(resolveUploadType('AW_ Angebotsanfrage.msg', '')).toBe('application/vnd.ms-outlook')
    expect(resolveUploadType('Auftrag.MSG', 'application/octet-stream')).toBe('application/vnd.ms-outlook')
    expect(resolveUploadType('Antwort.eml', '')).toBe('message/rfc822')
    expect(validateUpload(1000, resolveUploadType('Auftrag.msg', ''))).toBeNull()
  })

  it('keeps a type the browser named correctly, and still turns away what the project does not take', () => {
    expect(resolveUploadType('Angebot.pdf', 'application/pdf')).toBe('application/pdf')
    expect(resolveUploadType('tool.exe', 'application/x-msdownload')).toBe('application/x-msdownload')
    expect(validateUpload(1000, resolveUploadType('tool.exe', 'application/x-msdownload'))).toBe('badType')
  })

  it('offers the endings in the file picker, for machines without a type for them', () => {
    expect(ACCEPT_UPLOADS).toContain('.msg')
    expect(ACCEPT_UPLOADS).toContain('.eml')
    expect(ACCEPT_UPLOADS).toContain('application/pdf')
  })
})

describe('comments: putting one right, and signs under it', () => {
  const author = { id: 'u1', role: 'MANAGER' }
  const admin = { id: 'u9', role: 'ADMIN' }

  it('lets only the author rewrite a comment, while an administrator may still take it back', () => {
    expect(canEditComment(author, { authorId: 'u1' })).toBe(true)
    expect(canEditComment(admin, { authorId: 'u1' })).toBe(false)
    expect(canEditComment(author, { authorId: null })).toBe(false)
    expect(canDeleteComment(admin, { authorId: 'u1' })).toBe(true)
  })

  it('knows the signs it offers and no others', () => {
    expect(REACTIONS[0]).toBe('👍')
    expect(isReaction('👍')).toBe(true)
    expect(isReaction('💩')).toBe(false)
    expect(isReaction(42)).toBe(false)
  })

  it('counts each sign once per person, in the order they are offered, and says whether the reader gave it', () => {
    const summary = reactionSummary(
      [
        { emoji: '❤️', userId: 'u2', name: 'Erika Beispiel' },
        { emoji: '👍', userId: 'u1', name: 'Max Muster' },
        { emoji: '👍', userId: 'u2', name: 'Erika Beispiel' },
      ],
      'u1'
    )
    expect(summary).toEqual([
      { emoji: '👍', count: 2, mine: true, names: ['Max Muster', 'Erika Beispiel'] },
      { emoji: '❤️', count: 1, mine: false, names: ['Erika Beispiel'] },
    ])
  })
})
