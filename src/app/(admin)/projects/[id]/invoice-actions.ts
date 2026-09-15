'use server'

import { requireManagement } from '@/lib/authz'
import { ApiError, markInvoiceReady, withdrawInvoice } from '@/lib/api-service'
import { parseInvoiceAmount } from '@/lib/invoices'

export type InvoiceActionResult = { error?: 'invalidAmount' | 'notAllowed' | 'saveFailed' }

const failure = (e: unknown): InvoiceActionResult => {
  if (!(e instanceof ApiError)) console.error('invoice', e)
  return { error: e instanceof ApiError && e.status === 403 ? 'notAllowed' : 'saveFailed' }
}

/**
 * The office marks an invoice ready. Without an amount field — prices are
 * hidden on the screen — the suggested amount is taken.
 */
export async function markProjectInvoiceReady(projectId: string, part: number, formData: FormData): Promise<InvoiceActionResult> {
  const user = await requireManagement()
  const amount = formData.has('amount') ? parseInvoiceAmount(String(formData.get('amount'))) : undefined
  if (amount === 'invalid') return { error: 'invalidAmount' }
  const number = String(formData.get('number') ?? '').trim().slice(0, 60) || null
  try {
    await markInvoiceReady(user, projectId, part, { number, amount }, { type: 'user', userId: user.id })
    return {}
  } catch (e) {
    return failure(e)
  }
}

export async function withdrawProjectInvoice(projectId: string, part: number): Promise<InvoiceActionResult> {
  const user = await requireManagement()
  try {
    await withdrawInvoice(user, projectId, part)
    return {}
  } catch (e) {
    return failure(e)
  }
}
