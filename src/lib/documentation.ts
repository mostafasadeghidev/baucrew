// A project's documentation — notes, photos, PDFs and voice notes from the
// site — as rules only: what may be sent, who may change what, how a stored
// recording is named and served. No server-only import, so it is unit-tested;
// the database side is src/lib/documentation-db.ts.

export type DocKind = 'TEXT' | 'IMAGE' | 'PDF' | 'VOICE'
export type DocFileKind = Exclude<DocKind, 'TEXT'>
export const DOC_KINDS: readonly DocKind[] = ['TEXT', 'IMAGE', 'PDF', 'VOICE']

export function isDocKind(value: unknown): value is DocKind {
  return typeof value === 'string' && (DOC_KINDS as readonly string[]).includes(value)
}

/** A note's words — and a transcript put right — at most this long. */
export const DOC_TEXT_MAX = 10_000

/** Photos sent in one go. */
export const DOC_MAX_IMAGES = 20

/**
 * How long a voice note may run. Ten minutes is a long walk round a site; the
 * recording then stays well under what the transcription service takes (25 MB).
 */
export const DOC_MAX_RECORDING_SECONDS = 600

/** Per file, by what it is. A photo arrives drawn smaller already (see photo-upload.ts). */
export const DOC_MAX_SIZE: Record<DocFileKind, number> = {
  IMAGE: 15 * 1024 * 1024,
  PDF: 25 * 1024 * 1024,
  VOICE: 20 * 1024 * 1024,
}

const TYPES: Record<DocFileKind, readonly string[]> = {
  IMAGE: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
  PDF: ['application/pdf'],
  // What MediaRecorder writes — Chrome and Firefox webm/ogg, Safari mp4 — and
  // a recording picked from the phone's own memo app.
  VOICE: ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/x-m4a', 'audio/m4a'],
}

/** What a file picker for that kind offers. */
export function docAccept(kind: DocFileKind): string {
  return kind === 'PDF' ? 'application/pdf,.pdf' : kind === 'IMAGE' ? 'image/*' : 'audio/*'
}

/** "audio/webm;codecs=opus" → "audio/webm": the type without its parameters, in small letters. */
export function baseType(mimeType: string): string {
  return mimeType.split(';')[0].trim().toLowerCase()
}

const BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  pdf: 'application/pdf',
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  aac: 'audio/aac',
}

/**
 * The type a documentation file is stored under. The browser's type is taken
 * when it is one this kind accepts; a file that came without one (a PDF from
 * some Android file pickers) is looked up by its name.
 */
export function docFileType(kind: DocFileKind, name: string, browserType: string): string {
  const given = baseType(browserType)
  if (TYPES[kind].includes(given)) return given
  const ext = /\.([a-z0-9]+)$/i.exec(name.trim())?.[1]?.toLowerCase()
  const byName = ext ? BY_EXTENSION[ext] : undefined
  return byName && TYPES[kind].includes(byName) ? byName : given
}

export type DocFileError = 'empty' | 'tooLarge' | 'badType'

export function validateDocFile(kind: DocFileKind, size: number, mimeType: string): DocFileError | null {
  if (size <= 0) return 'empty'
  if (size > DOC_MAX_SIZE[kind]) return 'tooLarge'
  if (!TYPES[kind].includes(baseType(mimeType))) return 'badType'
  return null
}

/** The ending a recording is stored under, by its type — what the transcription service reads the format from. */
export function audioExtension(mimeType: string): string {
  const type = baseType(mimeType)
  if (type === 'audio/mp4' || type === 'audio/x-m4a' || type === 'audio/m4a') return 'm4a'
  if (type === 'audio/mpeg') return 'mp3'
  if (type === 'audio/x-wav') return 'wav'
  return type.split('/')[1] || 'webm'
}

/** "Sprachnotiz 2026-10-31 14-05.m4a" — a recording has no name of its own. */
export function voiceFileName(at: Date, mimeType: string): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}-${pad(at.getMinutes())}`
  return `Sprachnotiz ${stamp}.${audioExtension(mimeType)}`
}

/**
 * The types a browser is asked to record in, best first: webm/opus wherever it
 * is offered (Chrome, Firefox, Android, newer Safari) — the format the
 * transcription service has read longest — and mp4 for the Safari that knows
 * nothing else. Every one of them the service reads.
 */
export const RECORDING_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'] as const

/** The first type in the list this browser records in, or null when it records none of them. */
export function pickRecordingType(isSupported: (type: string) => boolean): string | null {
  return RECORDING_TYPES.find((type) => isSupported(type)) ?? null
}

/** A note's words as saved: trimmed, at most DOC_TEXT_MAX long, null when nothing is left. */
export function cleanDocText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const text = raw.replace(/\r\n/g, '\n').trim().slice(0, DOC_TEXT_MAX)
  return text || null
}

/** A measured length the phone sends along: whole milliseconds, within the limit, or none. */
export function cleanDuration(raw: unknown): number | null {
  const ms = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : typeof raw === 'number' ? raw : NaN
  if (!Number.isFinite(ms) || ms <= 0) return null
  return Math.min(Math.round(ms), (DOC_MAX_RECORDING_SECONDS + 5) * 1000)
}

/** "0:07", "4:32", "10:00". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

type Reader = { id: string; role: string }
type EntryOwner = { authorId: string | null }

const office = (user: Reader) => user.role === 'ADMIN' || user.role === 'MANAGER'

/**
 * Who puts an entry's words right: whoever wrote or spoke it, and the office —
 * a transcript the service misheard is corrected by whoever reads it in the
 * office too. Photos and PDFs have no words to change.
 */
export function canEditDocEntry(user: Reader, entry: EntryOwner & { kind: DocKind }): boolean {
  if (entry.kind !== 'TEXT' && entry.kind !== 'VOICE') return false
  return office(user) || (entry.authorId !== null && entry.authorId === user.id)
}

/** Who takes an entry back: whoever made it, and the office. */
export function canDeleteDocEntry(user: Reader, entry: EntryOwner): boolean {
  return office(user) || (entry.authorId !== null && entry.authorId === user.id)
}

/**
 * The part of a stored file a `Range` header asks for — what Safari's audio
 * player sends before it plays a note at all. Null when the header is absent
 * or names something this server does not answer (several ranges, say): the
 * whole file then goes. 'invalid' when the range lies outside the file.
 */
export function parseRange(header: string | null, size: number): { start: number; end: number } | null | 'invalid' {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const [, from, to] = match
  if (from === '' && to === '') return null
  let start: number
  let end: number
  if (from === '') {
    // "bytes=-500": the last 500 bytes.
    const tail = Number(to)
    if (tail === 0) return 'invalid'
    start = Math.max(0, size - tail)
    end = size - 1
  } else {
    start = Number(from)
    end = to === '' ? size - 1 : Math.min(Number(to), size - 1)
  }
  if (start >= size || start > end) return 'invalid'
  return { start, end }
}

/** Whether a stored documentation file is shown in the page: PDFs, pictures, recordings. Anything else is a download. */
export function docServesInline(mimeType: string): boolean {
  const type = baseType(mimeType)
  return type === 'application/pdf' || type.startsWith('image/') || type.startsWith('audio/')
}

/** How the transcription is set up, from the server's environment. */
export type TranscriptionSettings = { model: string; language: string }

/** The model when OPENAI_TRANSCRIBE_MODEL does not name one. */
export const DEFAULT_TRANSCRIBE_MODEL = 'gpt-4o-mini-transcribe'

export function transcriptionSettings(env: Record<string, string | undefined>): TranscriptionSettings {
  const read = (name: string) => env[name]?.trim() || undefined
  const language = read('OPENAI_TRANSCRIBE_LANGUAGE')?.toLowerCase()
  return {
    model: read('OPENAI_TRANSCRIBE_MODEL') ?? DEFAULT_TRANSCRIBE_MODEL,
    // ISO-639-1, two letters; anything else falls back to German, the site's language.
    language: language && /^[a-z]{2}$/.test(language) ? language : 'de',
  }
}
