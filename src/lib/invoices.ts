/**
 * The two invoices a job is billed in — half on account, the rest at the end —
 * and the figures the office is offered when it marks one ready.
 *
 * Pure, so the rules are tested without a database.
 */

export const INVOICE_PARTS = [1, 2] as const
export type InvoicePart = (typeof INVOICE_PARTS)[number]

/** The share of the order value the first invoice asks for. */
export const FIRST_INVOICE_SHARE = 0.5

/** How a part is named to automations: `first` and `final`. */
export const INVOICE_KIND: Record<InvoicePart, 'first' | 'final'> = { 1: 'first', 2: 'final' }

/** A part from the address or a form: 1, 2, `first` or `final`; null when it is none of them. */
export function invoicePartOf(value: string | number): InvoicePart | null {
  const v = String(value).trim().toLowerCase()
  if (v === '1' || v === 'first') return 1
  if (v === '2' || v === 'final') return 2
  return null
}

const cents = (n: number) => Math.round(n * 100) / 100

/**
 * The amount an invoice will likely carry: half the order value for the first;
 * for the final, what the first left over — so follow-on offers accepted in
 * between land on the final invoice. Null while the job has no value.
 */
export function suggestedInvoiceAmount(part: InvoicePart, orderValue: number | null, firstAmount: number | null): number | null {
  if (orderValue == null) return null
  if (part === 1) return cents(orderValue * FIRST_INVOICE_SHARE)
  const rest = firstAmount == null ? orderValue * (1 - FIRST_INVOICE_SHARE) : orderValue - firstAmount
  return cents(Math.max(0, rest))
}

/**
 * An amount as the office types it: "12.500,50", "12.500", "12500.50",
 * "12 500 €". Empty is null; anything else that is not a sum of money is
 * `invalid`.
 */
export function parseInvoiceAmount(raw: string): number | null | 'invalid' {
  const v = raw.replace(/\s|€/g, '')
  if (!v) return null
  const thousands = /^\d{1,3}(\.\d{3})+$/.test(v)
  const plain = v.includes(',') || thousands ? v.replace(/\./g, '').replace(',', '.') : v
  if (!/^\d+(\.\d{1,2})?$/.test(plain)) return 'invalid'
  const n = Number(plain)
  return n > 999_999_999 ? 'invalid' : n
}
