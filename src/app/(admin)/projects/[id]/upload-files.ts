/**
 * Sending files onto a project from the browser — the one way the upload
 * button, a drop on a card's back and a drop on a card on the board all take.
 * The files go one after the other, and one file turned away does not stop
 * the rest: what failed is reported by name, what worked is on the card.
 */

export type UploadError = 'tooLarge' | 'badType' | 'uploadFailed'
export type UploadFailure = { name: string; error: UploadError }

export async function uploadProjectFiles(
  projectId: string,
  files: File[],
  onProgress?: (done: number, total: number) => void
): Promise<{ sent: number; failed: UploadFailure[]; ids: string[] }> {
  let sent = 0
  const failed: UploadFailure[] = []
  const ids: string[] = []
  for (const [index, file] of files.entries()) {
    onProgress?.(index, files.length)
    const body = new FormData()
    body.append('file', file)
    try {
      const res = await fetch(`/api/projects/${projectId}/files`, { method: 'POST', body })
      if (res.ok) {
        sent++
        const data = (await res.json().catch(() => ({}))) as { id?: string }
        if (data.id) ids.push(data.id)
        continue
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      failed.push({ name: file.name, error: data.error === 'tooLarge' || data.error === 'badType' ? data.error : 'uploadFailed' })
    } catch {
      failed.push({ name: file.name, error: 'uploadFailed' })
    }
  }
  onProgress?.(files.length, files.length)
  return { sent, failed, ids }
}

/** Whether a drag carries files from the computer — not a card being moved, not a piece of text. */
export function dragHasFiles(e: { dataTransfer: DataTransfer | null }): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files')
}
