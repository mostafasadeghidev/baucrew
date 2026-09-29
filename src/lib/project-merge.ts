/**
 * What the kept project takes over from the dropped one when two records of
 * the same job are folded into one: whatever it lacks. Things that belong
 * together travel together — the site's address with its place on the map,
 * the due day with its hour and reminder, the rough month with its length —
 * so a merge never pins one town's name to another town's coordinates.
 */

export type MergeFields = {
  externalSystem: string | null
  externalId: string | null
  externalUrl: string | null
  sourceCreatedAt: Date | null
  clientType: string | null
  buildingType: string | null
  priority: string | null
  leadSource: string | null
  street: string | null
  postalCode: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  phone: string | null
  contact: string | null
  isSub: boolean
  plannedStart: Date | null
  plannedEnd: Date | null
  planMonth: Date | null
  planMonths: number
  dueDate: Date | null
  dueTime: string | null
  dueReminder: number | null
  actualStart: Date | null
  actualEnd: Date | null
  inspectionDate: Date | null
  executionWish: string | null
  managerId: string | null
  coverDocumentId: string | null
  description: string | null
  internalNotes: string | null
}

export function mergedFields(keep: MergeFields, drop: MergeFields, from: string): MergeFields {
  const joined = (mine: string | null, theirs: string | null) =>
    theirs ? `${mine ? `${mine}\n\n` : ''}--- ${from} ---\n${theirs}` : mine
  const site = keep.street || keep.postalCode || keep.city ? keep : drop
  const span = keep.plannedStart || keep.plannedEnd ? keep : drop
  const month = keep.plannedStart || keep.planMonth ? keep : drop
  const due = keep.dueDate ? keep : drop
  return {
    externalSystem: keep.externalSystem ?? drop.externalSystem,
    externalId: keep.externalId ?? drop.externalId,
    externalUrl: keep.externalUrl ?? drop.externalUrl,
    sourceCreatedAt: keep.sourceCreatedAt ?? drop.sourceCreatedAt,
    clientType: keep.clientType ?? drop.clientType,
    buildingType: keep.buildingType ?? drop.buildingType,
    priority: keep.priority ?? drop.priority,
    leadSource: keep.leadSource ?? drop.leadSource,
    street: site.street,
    postalCode: site.postalCode,
    city: site.city,
    latitude: site.latitude,
    longitude: site.longitude,
    phone: keep.phone ?? drop.phone,
    contact: keep.contact ?? drop.contact,
    isSub: keep.isSub || drop.isSub,
    plannedStart: span.plannedStart,
    plannedEnd: span.plannedEnd,
    planMonth: month.planMonth,
    planMonths: month.planMonths,
    dueDate: due.dueDate,
    dueTime: due.dueTime,
    dueReminder: due.dueReminder,
    actualStart: keep.actualStart ?? drop.actualStart,
    actualEnd: keep.actualEnd ?? drop.actualEnd,
    inspectionDate: keep.inspectionDate ?? drop.inspectionDate,
    executionWish: keep.executionWish ?? drop.executionWish,
    managerId: keep.managerId ?? drop.managerId,
    coverDocumentId: keep.coverDocumentId ?? drop.coverDocumentId,
    description: joined(keep.description, drop.description),
    internalNotes: joined(keep.internalNotes, drop.internalNotes),
  }
}
