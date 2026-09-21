/**
 * The step a project usually takes next — what the list offers as one click:
 * an offer written, the order placed, planned, begun, finished, invoiced,
 * paid. A paid or a cancelled project has no next step; anything out of the
 * ordinary is what the status menu beside the button is for.
 *
 * Pure, so the order is tested without a database.
 */
const FLOW = ['LEAD', 'QUOTED', 'APPROVED', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'PAID'] as const

export function nextStatus(status: string): string | null {
  const at = (FLOW as readonly string[]).indexOf(status)
  return at === -1 || at === FLOW.length - 1 ? null : FLOW[at + 1]
}
