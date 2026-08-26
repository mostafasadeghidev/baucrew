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
