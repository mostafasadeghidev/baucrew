import { describe, expect, it } from 'vitest'
import { markdownBlocks, parseInline } from '@/lib/markdown'

describe('parseInline', () => {
  it('reads bold, italic, struck and code', () => {
    expect(parseInline('**Gerüst** steht, *bitte* ~~nicht~~ `rot`')).toEqual([
      { t: 'b', children: [{ t: 'text', text: 'Gerüst' }] },
      { t: 'text', text: ' steht, ' },
      { t: 'i', children: [{ t: 'text', text: 'bitte' }] },
      { t: 'text', text: ' ' },
      { t: 's', children: [{ t: 'text', text: 'nicht' }] },
      { t: 'text', text: ' ' },
      { t: 'code', text: 'rot' },
    ])
  })

  it('nests a mark inside another', () => {
    expect(parseInline('**sehr _wichtig_**')).toEqual([
      { t: 'b', children: [{ t: 'text', text: 'sehr ' }, { t: 'i', children: [{ t: 'text', text: 'wichtig' }] }] },
    ])
  })

  it('leaves stars and underscores alone that are no marks', () => {
    expect(parseInline('Muster_Plan_2026.pdf')).toEqual([{ t: 'text', text: 'Muster_Plan_2026.pdf' }])
    expect(parseInline('5 * 3 = 15')).toEqual([{ t: 'text', text: '5 * 3 = 15' }])
    expect(parseInline('**offen')).toEqual([{ t: 'text', text: '**offen' }])
  })
})

describe('markdownBlocks', () => {
  it('reads headings, lists, quotes and rules', () => {
    const blocks = markdownBlocks('# Muster\n## Kontakt\n- Max Muster\n- 0123 456\n1. Gerüst\n2. Grund\n> Kunde ruft an\n---\nText')
    expect(blocks.map((b) => b.t)).toEqual(['h1', 'h2', 'li', 'li', 'li', 'li', 'quote', 'hr', 'p'])
    expect(blocks[2]).toEqual({ t: 'li', ordered: false, n: 0, inlines: [{ t: 'text', text: 'Max Muster' }] })
    expect(blocks[5]).toMatchObject({ t: 'li', ordered: true, n: 2 })
  })

  it('keeps code as it was written', () => {
    expect(markdownBlocks('```\n**nicht fett**\n```')).toEqual([{ t: 'pre', text: '**nicht fett**' }])
  })

  it('turns [words](address) into one link, and a bare address into a link', () => {
    const [block] = markdownBlocks('Siehe [Aufmaß](https://example.test/aufmass) und https://example.test/plan.pdf')
    expect(block).toMatchObject({ t: 'p' })
    const inlines = (block as { inlines: unknown[] }).inlines
    expect(inlines[0]).toEqual({ t: 'text', text: 'Siehe ' })
    expect(inlines[1]).toEqual({ t: 'link', href: 'https://example.test/aufmass', text: 'Aufmaß' })
    expect(inlines[3]).toMatchObject({ t: 'link', href: 'https://example.test/plan.pdf', text: 'plan.pdf' })
  })

  it('still folds the old board’s name and address into one link', () => {
    const blocks = markdownBlocks('- Muster Bericht.pdf:\nhttps://example.test/Muster_Bericht.pdf')
    expect(blocks).toEqual([{ t: 'p', inlines: [{ t: 'link', href: 'https://example.test/Muster_Bericht.pdf', text: 'Muster Bericht.pdf' }] }])
  })

  it('never makes a link of anything but http(s)', () => {
    const [block] = markdownBlocks('[klick](javascript:alert(1))')
    expect(JSON.stringify(block)).not.toContain('"t":"link"')
  })
})
