// Pure upload rules — no server-only import so they can be unit-tested.

export const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25 MB

/** What may be attached to a project: documents, images, tables. */
export const ALLOWED_MIME_TYPES: readonly string[] = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'text/csv',
  'text/plain',
]

export type UploadError = 'tooLarge' | 'badType' | 'empty'

export function validateUpload(size: number, mimeType: string): UploadError | null {
  if (size <= 0) return 'empty'
  if (size > MAX_FILE_SIZE) return 'tooLarge'
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) return 'badType'
  return null
}

const TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  heic: 'image/heic',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  csv: 'text/csv',
  txt: 'text/plain',
}

/** The type of an accepted file by its name, for a file that came without one. */
export function mimeFromName(name: string): string | null {
  const ext = /\.([a-z0-9]+)$/i.exec(name.trim())?.[1]?.toLowerCase()
  return ext ? (TYPE_BY_EXTENSION[ext] ?? null) : null
}

/** How a browser can draw a stored file inside the page. */
export type PreviewKind = 'pdf' | 'image' | 'text'

/**
 * Whether a file can be looked at inside the project, by its type. Only what
 * every browser draws on its own: a PDF, the three picture formats they all
 * read, plain text. HEIC is a picture no browser but Safari opens, and a table
 * or a Word file has to be downloaded whatever is done here.
 */
export function previewKind(mimeType: string): PreviewKind | null {
  const type = mimeType.trim().toLowerCase()
  if (type === 'application/pdf') return 'pdf'
  if (type === 'image/png' || type === 'image/jpeg' || type === 'image/webp') return 'image'
  if (type === 'text/plain') return 'text'
  return null
}

/** Keeps the extension, drops anything path- or header-hostile. */
export function safeFileName(name: string): string {
  const trimmed = name.split(/[\\/]/).pop()?.trim() || 'datei'
  const cleaned = trimmed.replace(/[^\p{L}\p{N} ._()\-]/gu, '_')
  return cleaned.slice(0, 120) || 'datei'
}

/** Storage key: per project, unique id in front of the readable name. */
export function storageKeyFor(projectId: string, uniqueId: string, fileName: string): string {
  return `${projectId}/${uniqueId}-${safeFileName(fileName)}`
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}
