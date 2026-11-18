import { describe, expect, it } from 'vitest'
import {
  DOC_MAX_RECORDING_SECONDS,
  DOC_MAX_SIZE,
  DOC_TEXT_MAX,
  audioExtension,
  baseType,
  canDeleteDocEntry,
  canEditDocEntry,
  cleanDocText,
  cleanDuration,
  docFileType,
  docServesInline,
  formatDuration,
  isDocKind,
  parseRange,
  pickRecordingType,
  transcriptionSettings,
  validateDocFile,
  voiceFileName,
} from '@/lib/documentation'

describe('documentation kinds and types', () => {
  it('knows its four kinds', () => {
    expect(['TEXT', 'IMAGE', 'PDF', 'VOICE'].every(isDocKind)).toBe(true)
    expect(isDocKind('VIDEO')).toBe(false)
    expect(isDocKind(null)).toBe(false)
  })

  it('drops a type’s parameters', () => {
    expect(baseType('audio/webm;codecs=opus')).toBe('audio/webm')
    expect(baseType(' Audio/MP4 ')).toBe('audio/mp4')
  })

  it('takes the browser’s type when it fits the kind, else the name’s', () => {
    expect(docFileType('VOICE', 'x', 'audio/webm;codecs=opus')).toBe('audio/webm')
    expect(docFileType('PDF', 'Plan.PDF', '')).toBe('application/pdf')
    expect(docFileType('PDF', 'Plan.pdf', 'application/octet-stream')).toBe('application/pdf')
    expect(docFileType('IMAGE', 'IMG_1.HEIC', '')).toBe('image/heic')
    // A name of another kind does not slip a file in.
    expect(docFileType('IMAGE', 'plan.pdf', '')).toBe('')
  })

  it('checks size and type per kind', () => {
    expect(validateDocFile('IMAGE', 1000, 'image/jpeg')).toBeNull()
    expect(validateDocFile('VOICE', 1000, 'audio/mp4')).toBeNull()
    expect(validateDocFile('PDF', 0, 'application/pdf')).toBe('empty')
    expect(validateDocFile('PDF', DOC_MAX_SIZE.PDF + 1, 'application/pdf')).toBe('tooLarge')
    expect(validateDocFile('IMAGE', 1000, 'application/pdf')).toBe('badType')
    expect(validateDocFile('PDF', 1000, 'text/html')).toBe('badType')
    expect(validateDocFile('VOICE', 1000, 'video/mp4')).toBe('badType')
  })
})

describe('recordings', () => {
  it('names the ending the transcription service reads the format from', () => {
    expect(audioExtension('audio/mp4')).toBe('m4a')
    expect(audioExtension('audio/webm;codecs=opus')).toBe('webm')
    expect(audioExtension('audio/ogg')).toBe('ogg')
    expect(audioExtension('audio/mpeg')).toBe('mp3')
    expect(audioExtension('audio/x-wav')).toBe('wav')
  })

  it('names a recording by when it was made', () => {
    expect(voiceFileName(new Date(2026, 9, 31, 14, 5), 'audio/mp4')).toBe('Sprachnotiz 2026-10-31 14-05.m4a')
  })

  it('records in the first type the browser offers', () => {
    // Safari before webm: mp4 only.
    expect(pickRecordingType((t) => t === 'audio/mp4')).toBe('audio/mp4')
    // Chrome offers both and gets webm.
    expect(pickRecordingType((t) => t === 'audio/mp4' || t.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus')
    expect(pickRecordingType(() => false)).toBeNull()
  })

  it('keeps a measured length within reason', () => {
    expect(cleanDuration('4321.6')).toBe(4322)
    expect(cleanDuration(1500)).toBe(1500)
    expect(cleanDuration('')).toBeNull()
    expect(cleanDuration('-3')).toBeNull()
    expect(cleanDuration('abc')).toBeNull()
    expect(cleanDuration(null)).toBeNull()
    expect(cleanDuration(10 ** 9)).toBe((DOC_MAX_RECORDING_SECONDS + 5) * 1000)
  })

  it('shows a length as minutes and seconds', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(7_400)).toBe('0:07')
    expect(formatDuration(272_000)).toBe('4:32')
    expect(formatDuration(600_000)).toBe('10:00')
  })
})

describe('note text', () => {
  it('trims, joins Windows line ends and caps the length', () => {
    expect(cleanDocText('  Gerüst steht \r\n')).toBe('Gerüst steht')
    expect(cleanDocText('a\r\nb')).toBe('a\nb')
    expect(cleanDocText('   ')).toBeNull()
    expect(cleanDocText(42)).toBeNull()
    expect(cleanDocText('x'.repeat(DOC_TEXT_MAX + 50))).toHaveLength(DOC_TEXT_MAX)
  })
})

describe('who may change an entry', () => {
  const admin = { id: 'a', role: 'ADMIN' }
  const manager = { id: 'm', role: 'MANAGER' }
  const site = { id: 's', role: 'SITE_MANAGER' }
  const crew = { id: 'c', role: 'EMPLOYEE' }

  it('lets the author and the office put words right', () => {
    const note = { kind: 'TEXT' as const, authorId: 'c' }
    expect(canEditDocEntry(crew, note)).toBe(true)
    expect(canEditDocEntry(admin, note)).toBe(true)
    expect(canEditDocEntry(manager, note)).toBe(true)
    expect(canEditDocEntry(site, note)).toBe(false)
    expect(canEditDocEntry({ id: 'x', role: 'EMPLOYEE' }, note)).toBe(false)
    expect(canEditDocEntry(manager, { kind: 'VOICE', authorId: 'c' })).toBe(true)
  })

  it('has no words to change on photos and PDFs', () => {
    expect(canEditDocEntry(admin, { kind: 'IMAGE', authorId: 'a' })).toBe(false)
    expect(canEditDocEntry(crew, { kind: 'PDF', authorId: 'c' })).toBe(false)
  })

  it('lets the author and the office take an entry back', () => {
    expect(canDeleteDocEntry(crew, { authorId: 'c' })).toBe(true)
    expect(canDeleteDocEntry(crew, { authorId: 's' })).toBe(false)
    expect(canDeleteDocEntry(site, { authorId: 's' })).toBe(true)
    expect(canDeleteDocEntry(site, { authorId: 'c' })).toBe(false)
    expect(canDeleteDocEntry(manager, { authorId: 'c' })).toBe(true)
    // An entry whose author was removed is the office's alone.
    expect(canDeleteDocEntry(crew, { authorId: null })).toBe(false)
    expect(canDeleteDocEntry(admin, { authorId: null })).toBe(true)
  })
})

describe('serving files in parts', () => {
  it('answers the ranges a player asks for', () => {
    expect(parseRange(null, 100)).toBeNull()
    expect(parseRange('bytes=0-1', 100)).toEqual({ start: 0, end: 1 })
    expect(parseRange('bytes=10-', 100)).toEqual({ start: 10, end: 99 })
    expect(parseRange('bytes=-30', 100)).toEqual({ start: 70, end: 99 })
    expect(parseRange('bytes=-300', 100)).toEqual({ start: 0, end: 99 })
    expect(parseRange('bytes=90-500', 100)).toEqual({ start: 90, end: 99 })
  })

  it('refuses a range outside the file and ignores what it does not answer', () => {
    expect(parseRange('bytes=100-', 100)).toBe('invalid')
    expect(parseRange('bytes=50-10', 100)).toBe('invalid')
    expect(parseRange('bytes=-0', 100)).toBe('invalid')
    expect(parseRange('bytes=0-1,5-6', 100)).toBeNull()
    expect(parseRange('items=0-1', 100)).toBeNull()
  })

  it('shows PDFs, pictures and recordings in the page, nothing else', () => {
    expect(docServesInline('application/pdf')).toBe(true)
    expect(docServesInline('image/jpeg')).toBe(true)
    expect(docServesInline('audio/mp4')).toBe(true)
    expect(docServesInline('text/html')).toBe(false)
  })
})

describe('transcription settings', () => {
  it('defaults to the small model in German', () => {
    expect(transcriptionSettings({})).toEqual({ model: 'gpt-4o-mini-transcribe', language: 'de' })
  })

  it('takes the model and language from the environment', () => {
    expect(transcriptionSettings({ OPENAI_TRANSCRIBE_MODEL: ' whisper-1 ', OPENAI_TRANSCRIBE_LANGUAGE: 'EN' })).toEqual({ model: 'whisper-1', language: 'en' })
  })

  it('falls back to German for a language it cannot read', () => {
    expect(transcriptionSettings({ OPENAI_TRANSCRIBE_LANGUAGE: 'deutsch' }).language).toBe('de')
  })
})
