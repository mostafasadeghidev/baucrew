/**
 * Sending a photo from the browser — the phone on the site, mostly.
 *
 * A phone's picture is four to eight megabytes and twelve megapixels; on a
 * site's mobile network that is a minute per photo, for a picture nobody will
 * look at larger than a screen. So it is drawn smaller before it leaves — the
 * long edge at most `maxEdge`, as a JPEG — and only what the browser cannot
 * draw (a HEIC outside Safari, say) goes as it is.
 *
 * Browser only: it needs a canvas.
 */

export const PHOTO_MAX_EDGE = 2000

/** The size a picture is drawn at so its long edge is at most `maxEdge`; never larger than it was. */
export function fitWithin(width: number, height: number, maxEdge = PHOTO_MAX_EDGE): { width: number; height: number } {
  const long = Math.max(width, height)
  if (long <= maxEdge || long === 0) return { width, height }
  const scale = maxEdge / long
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** "IMG_0012.HEIC" → "IMG_0012.jpg": the name says what the file now is. */
export function jpegName(name: string): string {
  const base = name.replace(/\.[a-z0-9]+$/i, '')
  return `${base || 'foto'}.jpg`
}

export async function downscaleImage(file: File, maxEdge = PHOTO_MAX_EDGE, quality = 0.85): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  try {
    const bitmap = await createImageBitmap(file)
    const size = fitWithin(bitmap.width, bitmap.height, maxEdge)
    // Small already, and a format every browser reads: nothing to gain.
    if (size.width === bitmap.width && file.size < 1_500_000 && file.type !== 'image/heic') {
      bitmap.close()
      return file
    }
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, size.width, size.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], jpegName(file.name), { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    // What the browser cannot draw it cannot shrink either.
    return file
  }
}

export type PhotoUploadError = 'tooLarge' | 'badType' | 'empty' | 'forbidden' | 'notFound' | 'uploadFailed'

/** One photo onto a project — and onto a defect of it, when there is one. */
export async function uploadProjectPhoto(
  projectId: string,
  file: File,
  defectId?: string
): Promise<{ id: string } | { error: PhotoUploadError }> {
  const data = new FormData()
  data.set('file', await downscaleImage(file))
  if (defectId) data.set('defectId', defectId)
  try {
    const response = await fetch(`/api/projects/${projectId}/files`, { method: 'POST', body: data })
    const body = (await response.json().catch(() => null)) as { id?: string; error?: string } | null
    if (response.ok && body?.id) return { id: body.id }
    const known: PhotoUploadError[] = ['tooLarge', 'badType', 'empty', 'forbidden', 'notFound']
    return { error: known.find((e) => e === body?.error) ?? 'uploadFailed' }
  } catch {
    return { error: 'uploadFailed' }
  }
}
