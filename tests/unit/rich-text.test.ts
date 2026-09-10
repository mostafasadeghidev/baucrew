import { describe, expect, it } from 'vitest'
import { linkLabel, parseNotes } from '@/lib/rich-text'

describe('linkLabel', () => {
  it('names a link after the file it points at', () => {
    expect(linkLabel('https://example.test/a/b/download/Muster_Bericht.pdf')).toBe(
      'Muster_Bericht.pdf'
    )
  })

  it('decodes the file name', () => {
    expect(linkLabel('https://example.test/x/M%C3%A4ngelr%C3%BCge_Muster.pdf')).toBe(
      'Mängelrüge_Muster.pdf'
    )
  })

  it('falls back to the site when the address is not a file', () => {
    expect(linkLabel('https://www.example.test/cards/123')).toBe('example.test')
  })

  it('survives an address it cannot parse', () => {
    expect(linkLabel('http://')).toBe('http://')
  })
})

describe('parseNotes', () => {
  it('leaves ordinary text alone', () => {
    expect(parseNotes('Fassade streichen\nab Montag')).toEqual([
      [{ text: 'Fassade streichen' }],
      [{ text: 'ab Montag' }],
    ])
  })

  it('folds a name line and the address under it into one link', () => {
    const out = parseNotes(
      '- Muster_Abnahme.pdf:\nhttps://example.test/1/cards/abc/download/Muster_Abnahme.pdf'
    )
    expect(out).toEqual([
      [
        {
          text: 'Muster_Abnahme.pdf',
          href: 'https://example.test/1/cards/abc/download/Muster_Abnahme.pdf',
        },
      ],
    ])
  })

  it('folds several attachments in a row, each with its own name', () => {
    const out = parseNotes(
      [
        'Anhänge:',
        '- Erste.pdf:',
        'https://example.test/d/Erste.pdf',
        '- Zweite.msg:',
        'https://example.test/d/Zweite.msg',
      ].join('\n')
    )
    expect(out).toHaveLength(3)
    expect(out[0]).toEqual([{ text: 'Anhänge:' }])
    expect(out[1]).toEqual([{ text: 'Erste.pdf', href: 'https://example.test/d/Erste.pdf' }])
    expect(out[2]).toEqual([{ text: 'Zweite.msg', href: 'https://example.test/d/Zweite.msg' }])
  })

  it('names a lone address after its own file when nothing introduced it', () => {
    expect(parseNotes('https://example.test/d/Allein.pdf')).toEqual([
      [{ text: 'Allein.pdf', href: 'https://example.test/d/Allein.pdf' }],
    ])
  })

  it('makes an address inside a sentence clickable without swallowing the sentence', () => {
    const out = parseNotes('Siehe https://example.test/d/Plan.pdf für die Details')
    expect(out).toEqual([
      [
        { text: 'Siehe ' },
        { text: 'Plan.pdf', href: 'https://example.test/d/Plan.pdf' },
        { text: ' für die Details' },
      ],
    ])
  })

  it('does not let a line that already has a link lend its words to the next one', () => {
    const out = parseNotes('siehe https://example.test/a.pdf :\nhttps://example.test/d/B.pdf')
    expect(out).toHaveLength(2)
    expect(out[1]).toEqual([{ text: 'B.pdf', href: 'https://example.test/d/B.pdf' }])
  })

  it('keeps empty lines, so paragraphs stay apart', () => {
    expect(parseNotes('eins\n\nzwei')).toEqual([[{ text: 'eins' }], [{ text: '' }], [{ text: 'zwei' }]])
  })

  it('handles windows line endings', () => {
    expect(parseNotes('eins\r\nzwei')).toEqual([[{ text: 'eins' }], [{ text: 'zwei' }]])
  })

  it('does not treat a trailing bracket as part of the address', () => {
    const out = parseNotes('(siehe https://example.test/d/Plan.pdf)')
    expect(out[0][1]).toEqual({ text: 'Plan.pdf', href: 'https://example.test/d/Plan.pdf' })
    expect(out[0][2]).toEqual({ text: ')' })
  })
})

describe('parseNotes — a name that is already written out', () => {
  it('leaves the link only its mark when the note names the file first', () => {
    const out = parseNotes(
      '- 2026-07-13_Muster Bericht.pdf: https://example.test/d/2026-07-13_Muster_Bericht.pdf'
    )
    expect(out[0][0].text).toBe('- 2026-07-13_Muster Bericht.pdf: ')
    expect(out[0][1]).toEqual({
      text: '',
      href: 'https://example.test/d/2026-07-13_Muster_Bericht.pdf',
      title: '2026-07-13_Muster_Bericht.pdf',
    })
  })

  it('still names the link when the note says something else', () => {
    const out = parseNotes('Siehe hier: https://example.test/d/Plan.pdf')
    expect(out[0][1]).toEqual({ text: 'Plan.pdf', href: 'https://example.test/d/Plan.pdf' })
  })

  it('matches across the difference between a space and an underscore', () => {
    const out = parseNotes(
      'AW_ Muster30 Musterstadt.msg: https://example.test/d/AW__Muster30_Musterstadt.msg'
    )
    expect(out[0][1].text).toBe('')
  })

  it('does not blank a link that follows nothing at all', () => {
    const out = parseNotes('https://example.test/d/Allein.pdf')
    expect(out[0][0].text).toBe('Allein.pdf')
  })
})
