/**
 * The story of a card, read off the audit log the way Trello's activity
 * reads it: who moved it from where to where, who put it away, who added a
 * photo or ticked a task. One line per entry, in plain words; an entry the
 * card has no words for is left out rather than shown as a key.
 *
 * Pure: the words come in as a function, so the lines are tested without
 * translations, and money never appears — an invoice line says which
 * invoice, never how much.
 */

export type AuditEntry = {
  action: string
  field: string | null
  oldValue: string | null
  newValue: string | null
  createdAt: Date
  user: { username: string } | null
}

export type HistoryLine = { when: Date; who: string | null; text: string }

/** Translates a history key with its values. */
export type Words = (key: string, values?: Record<string, string>) => string

const name = (value: string | null, fallback = '…') => value?.trim() || fallback

/**
 * The words for one entry, or null when the card has none for it. Status
 * names are looked up by the caller, so the line says "Geplant", not
 * "PLANNED".
 */
export function describeAudit(entry: AuditEntry, t: Words, statusLabel: (status: string) => string): string | null {
  const { action, field, oldValue, newValue } = entry
  switch (action) {
    case 'project.create':
      return t('created')
    case 'project.status':
    case 'project.status.auto':
      return t(action === 'project.status.auto' ? 'statusAuto' : 'status', {
        from: oldValue ? statusLabel(oldValue) : '—',
        to: newValue ? statusLabel(newValue) : '—',
      })
    case 'project.reopen':
      return t('reopened')
    case 'project.archive':
      return t('archived')
    case 'project.restore':
      return t('restored')
    case 'project.update':
      if (field === 'name') return t('renamed', { name: name(newValue) })
      if (field === 'priority') return t('priority')
      return t('updated')
    case 'project.merge':
      return t('merged')
    case 'project.file.add':
      return t('fileAdded', { name: name(newValue) })
    case 'project.file.delete':
      return t('fileDeleted', { name: name(oldValue) })
    case 'project.file.visibility':
      return t(newValue === 'crew' ? 'fileShown' : 'fileHidden', { name: name(field) })
    case 'project.cover.set':
      return t('coverSet')
    case 'project.cover.clear':
      return t('coverCleared')
    case 'project.task.create':
      return t('taskAdded', { title: name(newValue) })
    case 'project.task.done':
      return t('taskDone', { title: name(newValue) })
    case 'project.task.reopen':
      return t('taskReopened', { title: name(newValue) })
    case 'project.task.delete':
      return t('taskDeleted', { title: name(oldValue) })
    case 'project.defect.report':
      return t('defectReported', { title: name(newValue) })
    case 'project.defect.resolve':
      return t('defectResolved', { title: name(newValue) })
    case 'project.defect.reopen':
      return t('defectReopened', { title: name(newValue) })
    case 'project.defect.delete':
      return t('defectDeleted', { title: name(oldValue) })
    case 'project.comment':
      return t('commented')
    case 'project.commentDeleted':
      return t('commentDeleted')
    case 'project.form.create':
      return t('formCreated', { title: name(newValue) })
    case 'project.form.sign':
      return t('formSigned', { title: name(newValue ?? field) })
    case 'project.form.unsign':
      return t('formUnsigned', { title: name(newValue ?? field) })
    case 'project.form.delete':
      return t('formDeleted', { title: name(oldValue) })
    case 'project.invoice.ready':
      return t('invoiceReady', { part: name(field?.replace('invoice', '') ?? null, '') })
    case 'project.invoice.withdraw':
      return t('invoiceWithdrawn', { part: name(field?.replace('invoice', '') ?? null, '') })
    default:
      return null
  }
}

/** The lines of a card's history, newest first, the entries without words left out. */
export function historyLines(entries: AuditEntry[], t: Words, statusLabel: (status: string) => string): HistoryLine[] {
  const lines: HistoryLine[] = []
  for (const entry of entries) {
    const text = describeAudit(entry, t, statusLabel)
    if (text) lines.push({ when: entry.createdAt, who: entry.user?.username ?? null, text })
  }
  return lines
}
