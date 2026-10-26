'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/authz'
import { parseTrelloExport, suggestStatus, type TrelloBoard } from '@/lib/trello'
import { fetchTrelloFiles, pendingTrelloFiles } from '@/lib/trello-files'
import { runTrelloImport, type TrelloImportResult } from '@/lib/trello/import'
import { ProjectStatus } from '@/generated/prisma/enums'

export type PreviewState =
  | { step: 'upload'; error?: 'invalidFile' }
  | { step: 'preview'; board: TrelloBoard; suggested: Record<string, string> }
  | ({ step: 'done'; filesPending: number } & TrelloImportResult)

const STATUS_VALUES = Object.keys(ProjectStatus) as ProjectStatus[]

export async function previewTrello(_prev: PreviewState, formData: FormData): Promise<PreviewState> {
  await requireAdmin()
  const file = formData.get('file')
  // Keep in step with serverActions.bodySizeLimit in next.config.ts.
  if (!(file instanceof File) || file.size === 0 || file.size > 10 * 1024 * 1024) {
    return { step: 'upload', error: 'invalidFile' }
  }
  let json: unknown
  try {
    json = JSON.parse(await file.text())
  } catch {
    return { step: 'upload', error: 'invalidFile' }
  }
  const board = parseTrelloExport(json)
  if (!board || board.cards.length === 0) return { step: 'upload', error: 'invalidFile' }

  const suggested: Record<string, string> = {}
  for (const list of board.lists) suggested[list.id] = suggestStatus(list.name)
  return { step: 'preview', board, suggested }
}

/** Single reducer for the wizard: upload → preview → done. */
export async function trelloWizard(prev: PreviewState, formData: FormData): Promise<PreviewState> {
  const phase = String(formData.get('_phase') ?? 'preview')
  if (phase === 'import' && prev.step === 'preview') return importTrello(prev, formData)
  return previewTrello(prev, formData)
}

/** The wizard's confirmation form, read into the importer's options; the import itself is src/lib/trello/import.ts. */
export async function importTrello(prev: PreviewState, formData: FormData): Promise<PreviewState> {
  const admin = await requireAdmin()
  if (prev.step !== 'preview') return { step: 'upload', error: 'invalidFile' }
  const { board } = prev

  // Mapping from the confirmation form: list_<id> → status or "SKIP"
  const mapping = new Map<string, ProjectStatus | 'SKIP'>()
  for (const list of board.lists) {
    const value = String(formData.get(`list_${list.id}`) ?? 'SKIP')
    mapping.set(list.id, STATUS_VALUES.includes(value as ProjectStatus) ? (value as ProjectStatus) : 'SKIP')
  }
  const result = await runTrelloImport(
    board,
    {
      mapping,
      includeArchived: formData.get('includeArchived') === 'on',
      makeBoard: formData.get('makeBoard') === 'on',
      oneCustomer: formData.get('oneCustomer') === 'on',
      want: {
        fields: formData.get('includeFields') === 'on',
        checklists: formData.get('includeChecklists') === 'on',
        comments: formData.get('includeComments') === 'on',
        templates: formData.get('checklistsAsTemplates') === 'on',
      },
    },
    admin.id
  )
  revalidatePath('/projects')
  revalidatePath('/customers')
  return { step: 'done', ...result, filesPending: await pendingTrelloFiles() }
}

/** A round of fetching: files brought over, files Trello would not give, and what is left. */
export type FetchFilesState = { fetched: number; failed: number; pending: number; configured: boolean }

/** Brings the next few attached files over from Trello; called until nothing is pending. */
export async function fetchTrelloFilesAction(): Promise<FetchFilesState> {
  const admin = await requireAdmin()
  const result = await fetchTrelloFiles(admin.id)
  if (result.fetched > 0) revalidatePath('/projects')
  return result
}
