// Shared pagination helpers — usable from server components and the
// client-side <Pagination> component alike.
export const PAGE_SIZE = 20

export function parsePage(value: string | undefined): number {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 ? n : 1
}
