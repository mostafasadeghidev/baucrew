import { describe, expect, it } from 'vitest'
import { faviconType, iconInitial, iconInk, iconVersion } from '@/lib/brand-icon'

const bytes = (...b: number[]) => new Uint8Array(b)
const text = (s: string) => new TextEncoder().encode(s)

describe('what an uploaded tab icon really is', () => {
  it('knows a PNG and an .ico by their first bytes', () => {
    expect(faviconType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0))).toBe('image/png')
    expect(faviconType(bytes(0, 0, 1, 0, 1, 0, 16, 16))).toBe('image/x-icon')
  })

  it('knows an SVG, with or without a declaration or a byte-order mark in front', () => {
    expect(faviconType(text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe('image/svg+xml')
    expect(faviconType(text('﻿<?xml version="1.0"?>\n<!-- Muster -->\n<svg viewBox="0 0 1 1"/>'))).toBe('image/svg+xml')
  })

  it('refuses a JPEG, a text file and an empty file, whatever they are called', () => {
    expect(faviconType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0))).toBeNull()
    expect(faviconType(text('Beispiel'))).toBeNull()
    expect(faviconType(text('<html><body>svg</body></html>'))).toBeNull()
    expect(faviconType(bytes())).toBeNull()
  })
})

describe('the letter on the generated icon', () => {
  it('is the first letter of the name, as a capital', () => {
    expect(iconInitial('Muster Malerei')).toBe('M')
    expect(iconInitial('über Bau')).toBe('Ü')
  })

  it('skips what is not a letter or a digit', () => {
    expect(iconInitial('  & Beispiel GmbH')).toBe('B')
    expect(iconInitial('1a Maler')).toBe('1')
  })

  it('falls back to a letter when the name has none', () => {
    expect(iconInitial('')).toBe('B')
    expect(iconInitial('—')).toBe('B')
  })
})

describe('the letter reads on the company colour', () => {
  it('is white on a dark colour and near-black on a light one', () => {
    expect(iconInk('#1d4ed8')).toBe('#ffffff')
    expect(iconInk('#000000')).toBe('#ffffff')
    expect(iconInk('#facc15')).toBe('#111827')
    expect(iconInk('#ffffff')).toBe('#111827')
  })

  it('stays white for something that is no colour', () => {
    expect(iconInk('blue')).toBe('#ffffff')
  })
})

describe('the mark in the icon address', () => {
  it('stays the same for the same icon and changes with it', () => {
    expect(iconVersion('Muster', '#1d4ed8')).toBe(iconVersion('Muster', '#1d4ed8'))
    expect(iconVersion('Muster', '#1d4ed8')).not.toBe(iconVersion('Muster', '#1d4ed9'))
    expect(iconVersion('Muster', '#1d4ed8')).not.toBe(iconVersion('Beispiel', '#1d4ed8'))
  })

  it('keeps the parts apart: "ab"+"c" is not "a"+"bc"', () => {
    expect(iconVersion('ab', 'c')).not.toBe(iconVersion('a', 'bc'))
  })

  it('is short enough for an address', () => {
    expect(iconVersion('data:image/png;base64,' + 'A'.repeat(100_000))).toMatch(/^[0-9a-z]{1,7}$/)
  })
})
