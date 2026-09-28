import { describe, expect, it } from 'vitest'
import { linkLabel, linkSite, normalizeLink, renamedFile } from '@/lib/card-links'

describe('normalizeLink', () => {
  it('takes an address as it was pasted', () => {
    expect(normalizeLink(' https://example.test/plan?a=1 ')).toBe('https://example.test/plan?a=1')
    expect(normalizeLink('http://example.test')).toBe('http://example.test/')
  })

  it('reads an address without a protocol as https', () => {
    expect(normalizeLink('www.example.test/angebot')).toBe('https://www.example.test/angebot')
  })

  it('refuses what is not a web address', () => {
    expect(normalizeLink('')).toBeNull()
    expect(normalizeLink('not a link')).toBeNull()
    expect(normalizeLink('javascript:alert(1)')).toBeNull()
    expect(normalizeLink('mailto:info@example.test')).toBeNull()
    expect(normalizeLink('muster')).toBeNull()
    expect(normalizeLink(`https://example.test/${'x'.repeat(2100)}`)).toBeNull()
  })
})

describe('how a link reads', () => {
  it('uses its own words first', () => {
    expect(linkLabel('https://example.test/a', '  Aufmaß  ')).toBe('Aufmaß')
  })

  it('else shows the site and the path', () => {
    expect(linkLabel('https://www.example.test/docs/plan/', null)).toBe('example.test/docs/plan')
    expect(linkLabel('https://example.test/', null)).toBe('example.test')
    expect(linkSite('https://www.example.test/docs')).toBe('example.test')
  })
})

describe('renamedFile', () => {
  it('keeps the ending when the new name leaves it off', () => {
    expect(renamedFile('Angebot.pdf', 'Angebot Muster')).toBe('Angebot Muster.pdf')
    expect(renamedFile('Angebot.pdf', 'Angebot Muster.PDF')).toBe('Angebot Muster.PDF')
  })

  it('takes a new ending as typed, and refuses an empty name', () => {
    expect(renamedFile('scan.jpg', 'scan.png')).toBe('scan.png')
    expect(renamedFile('scan.jpg', '   ')).toBeNull()
  })

  it('drops slashes and control characters', () => {
    expect(renamedFile('a.pdf', 'plan/entwurf')).toBe('planentwurf.pdf')
  })
})
