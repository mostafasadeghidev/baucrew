import { describe, expect, it } from 'vitest'
import { fetchedFileType, servesInline } from '@/lib/files'

describe('fetchedFileType', () => {
  it('believes the other side only for a type the project takes', () => {
    expect(fetchedFileType('angebot.pdf', 'application/pdf')).toBe('application/pdf')
    expect(fetchedFileType('foto.jpg', 'image/jpeg; charset=binary')).toBe('image/jpeg')
    expect(fetchedFileType('Foto.JPG', 'IMAGE/JPEG')).toBe('image/jpeg')
  })

  it('never stores a type a browser would run', () => {
    expect(fetchedFileType('seite.html', 'text/html')).toBe('application/octet-stream')
    expect(fetchedFileType('logo.svg', 'image/svg+xml')).toBe('application/octet-stream')
    expect(fetchedFileType('seite.html', null)).toBe('application/octet-stream')
  })

  it('lets the name decide when the header says nothing useful', () => {
    expect(fetchedFileType('mail.msg', 'application/octet-stream')).toBe('application/vnd.ms-outlook')
    expect(fetchedFileType('liste.csv', undefined)).toBe('text/csv')
    expect(fetchedFileType('unbekannt.bin', 'application/x-whatever')).toBe('application/octet-stream')
  })
})

describe('servesInline', () => {
  it('shows pictures, PDFs and plain text in the page', () => {
    for (const type of ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'text/plain']) {
      expect(servesInline(type), type).toBe(true)
    }
  })

  it('hands everything else over as a download', () => {
    for (const type of ['text/html', 'image/svg+xml', 'application/xhtml+xml', 'text/csv', 'application/vnd.ms-outlook', 'application/octet-stream']) {
      expect(servesInline(type), type).toBe(false)
    }
  })
})
