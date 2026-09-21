import { describe, expect, it } from 'vitest'
import { fitWithin, jpegName } from '@/lib/photo-upload'

describe('fitWithin', () => {
  it('brings the long edge down to the limit and keeps the shape', () => {
    expect(fitWithin(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 })
    expect(fitWithin(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 })
  })

  it('never makes a picture larger', () => {
    expect(fitWithin(800, 600, 2000)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(0, 0, 2000)).toEqual({ width: 0, height: 0 })
  })
})

describe('jpegName', () => {
  it('says what the file now is', () => {
    expect(jpegName('IMG_0012.HEIC')).toBe('IMG_0012.jpg')
    expect(jpegName('baustelle.foto.png')).toBe('baustelle.foto.jpg')
    expect(jpegName('ohne-endung')).toBe('ohne-endung.jpg')
    expect(jpegName('.png')).toBe('foto.jpg')
  })
})
