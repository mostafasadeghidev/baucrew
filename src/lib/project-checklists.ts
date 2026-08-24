/**
 * Which checklists a project should carry. The project form offers the
 * checklist templates; this decides what to copy in and what may go again.
 * Pure — the DB work lives in the project actions.
 */

export type ProjectChecklistState = {
  id: string
  /** The template it was copied from; null for a list written by hand. */
  templateId: string | null
  /** True as soon as one point has been ticked or noted on site. */
  ticked: boolean
}

export type ChecklistPlan = {
  /** Template ids to copy into the project. */
  add: string[]
  /** Project checklist ids to delete (nothing was ticked yet). */
  remove: string[]
  /** Unselected but already worked on — kept, and the user is told. */
  kept: string[]
}

export function planChecklistChanges(
  current: ProjectChecklistState[],
  selectedTemplateIds: string[]
): ChecklistPlan {
  const selected = [...new Set(selectedTemplateIds.filter(Boolean))]
  const present = new Set(current.map((c) => c.templateId).filter((id): id is string => id !== null))

  const add = selected.filter((id) => !present.has(id))
  const remove: string[] = []
  const kept: string[] = []
  for (const list of current) {
    // Lists written by hand on the project are never touched from the form.
    if (list.templateId === null || selected.includes(list.templateId)) continue
    if (list.ticked) kept.push(list.id)
    else remove.push(list.id)
  }
  return { add, remove, kept }
}
