import 'server-only'
import { revalidatePath } from 'next/cache'
import { db } from './db'
import { readStoredFile } from './file-storage'
import { quoteOcr } from './quote-ocr'
import { readDocumentQuote } from './quotes-db'
import { pushProjectInBackground } from './wattro/project-push'

/**
 * A new file read for a quote, in the app: after an upload, and when Trello's
 * files are fetched. Never fails the caller — a file that will not read is
 * a file that was not read.
 */
export async function readUploadedQuote(documentId: string, userId: string | null): Promise<void> {
  try {
    const result = await readDocumentQuote(documentId, { db, readFile: readStoredFile, userId, ocr: quoteOcr() })
    if (!result?.read) return
    // Wattro knows the project by this number: it is renamed there, not made twice.
    if (result.applied?.jobNumberFilled) pushProjectInBackground(result.projectId, 'updated')
    try {
      revalidatePath(`/projects/${result.projectId}`)
    } catch {
      // Outside a request (the Trello timer) there is no page to refresh; the next visit reads afresh.
    }
  } catch (e) {
    console.error('quote reading failed', e)
  }
}
