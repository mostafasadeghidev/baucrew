/**
 * Stock shortage hint: a project needs `needed` of an item but the warehouse
 * only lists `stock`. Warning only — never blocks (material is often bought
 * later or comes from another site).
 */
export function stockShortage(needed: number | null | undefined, stock: number | null | undefined): number | null {
  if (needed == null || stock == null) return null
  if (!Number.isFinite(needed) || !Number.isFinite(stock)) return null
  const diff = needed - stock
  return diff > 0 ? diff : null
}
