import type { Prisma } from '@/generated/prisma/client'
import type { ProjectStatus } from '@/generated/prisma/enums'
import { trelloRuleId } from './board-rules'

/** Database equivalent of membership in columnFor, shared by both views.
 * A plain column accepts the status's remaining cards, so its union with rule
 * columns is the whole status. Rule precedence only affects placement.
 */
export function boardProjectsWhere(columns: Array<{ status: string; rule: string | null }>, currentYear: number): Prisma.ProjectWhereInput {
  const nextYear = new Date(Date.UTC(currentYear + 1, 0, 1))
  const clauses: Prisma.ProjectWhereInput[] = []
  for (const status of new Set(columns.map((column) => column.status))) {
    const own = columns.filter((column) => column.status === status)
    if (own.some((column) => column.rule === null)) {
      clauses.push({ status: status as ProjectStatus })
      continue
    }
    for (const column of own) {
      const trelloList = trelloRuleId(column.rule)
      let rule: Prisma.ProjectWhereInput
      if (trelloList !== null) {
        rule = { links: { some: { system: 'trello', externalListId: trelloList } } }
      } else {
        switch (column.rule) {
          case 'paused': rule = { pausedAt: { not: null } }; break
          case 'lowPriority': rule = { priority: 'LOW' }; break
          case 'invoice1': rule = { invoices: { some: { part: 1 } } }; break
          case 'nextYear': rule = { OR: [{ plannedStart: { gte: nextYear } }, { plannedStart: null, planMonth: { gte: nextYear } }] }; break
          default: continue
        }
      }
      clauses.push({ AND: [{ status: status as ProjectStatus }, rule] })
    }
  }
  // An explicit impossible predicate also stays empty when nested in AND.
  return clauses.length ? { OR: clauses } : { id: { in: [] } }
}
