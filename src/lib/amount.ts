/**
 * A sum of money as people type it: "12.500,50", "12.500", "12500.50",
 * "12 500 €", "1.5". A dot before groups of three digits with no comma
 * anywhere groups thousands — "12.000" is twelve thousand, never twelve.
 * Empty is null; anything else that is not a sum of money is `invalid`.
 * Used wherever an amount is typed in: the order value, an invoice, the
 * imports.
 */
export function parseAmount(raw: string): number | null | 'invalid' {
  const v = raw.replace(/\s|€/g, '')
  if (!v) return null
  const thousands = /^\d{1,3}(\.\d{3})+$/.test(v)
  const plain = v.includes(',') || thousands ? v.replace(/\./g, '').replace(',', '.') : v
  if (!/^\d+(\.\d{1,2})?$/.test(plain)) return 'invalid'
  const n = Number(plain)
  return n > 999_999_999 ? 'invalid' : n
}
