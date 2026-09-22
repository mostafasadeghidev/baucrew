// What a backup holds: every table of the app, in the order they depend on
// each other. Parents come first, so a restore can insert straight down the
// list and wipe straight up it. Sessions and the webhook deliveries are left
// out — they belong to a running installation, not to its data.
//
// The `model` names match prisma/schema.prisma; a test holds the two lists
// against each other, so a new table cannot slip past the backup unnoticed.

export type BackupTable = {
  /** Key in the backup file (the same as version 1 used, where it existed). */
  key: string
  /** Prisma model name. */
  model: string
}

export const BACKUP_TABLES: readonly BackupTable[] = [
  { key: 'users', model: 'User' },
  { key: 'workCategories', model: 'WorkCategory' },
  { key: 'customers', model: 'Customer' },
  { key: 'employees', model: 'Employee' },
  { key: 'absences', model: 'Absence' },
  { key: 'vehicles', model: 'Vehicle' },
  { key: 'devices', model: 'Device' },
  { key: 'catalogItems', model: 'CatalogItem' },
  { key: 'checklistTemplates', model: 'ChecklistTemplate' },
  { key: 'checklistTemplateItems', model: 'ChecklistTemplateItem' },
  { key: 'projectTemplates', model: 'ProjectTemplate' },
  { key: 'templateVehicles', model: 'TemplateVehicle' },
  { key: 'templateEmployees', model: 'TemplateEmployee' },
  { key: 'templateItems', model: 'TemplateItem' },
  { key: 'templateChecklists', model: 'TemplateChecklist' },
  { key: 'templateDevices', model: 'TemplateDevice' },
  { key: 'boards', model: 'Board' },
  { key: 'boardColumns', model: 'BoardColumn' },
  { key: 'projects', model: 'Project' },
  { key: 'projectLinks', model: 'ProjectLink' },
  { key: 'projectWorkCategories', model: 'ProjectWorkCategory' },
  { key: 'projectAddOns', model: 'ProjectAddOn' },
  { key: 'projectInvoices', model: 'ProjectInvoice' },
  { key: 'projectEmployees', model: 'ProjectEmployee' },
  { key: 'projectVehicles', model: 'ProjectVehicle' },
  { key: 'projectItems', model: 'ProjectItem' },
  { key: 'projectDevices', model: 'ProjectDevice' },
  { key: 'deviceAssignments', model: 'DeviceAssignment' },
  { key: 'projectChecklists', model: 'ProjectChecklist' },
  { key: 'projectChecklistItems', model: 'ProjectChecklistItem' },
  { key: 'scheduleEntries', model: 'ScheduleEntry' },
  { key: 'scheduleEntryEmployees', model: 'ScheduleEntryEmployee' },
  { key: 'scheduleEntryVehicles', model: 'ScheduleEntryVehicle' },
  { key: 'notes', model: 'Note' },
  // Before the documents: a photo points at the defect it shows.
  { key: 'defects', model: 'Defect' },
  { key: 'projectTasks', model: 'ProjectTask' },
  { key: 'documents', model: 'Document' },
  // After the documents: a signed form points at its PDF among them.
  { key: 'formTemplates', model: 'FormTemplate' },
  { key: 'filledForms', model: 'FilledForm' },
  { key: 'formSignatures', model: 'FormSignature' },
  { key: 'timeEntries', model: 'TimeEntry' },
  { key: 'planEntries', model: 'PlanEntry' },
  { key: 'projectDrafts', model: 'ProjectDraft' },
  { key: 'appSettings', model: 'AppSetting' },
  { key: 'apiKeys', model: 'ApiKey' },
  { key: 'webhookEndpoints', model: 'WebhookEndpoint' },
  { key: 'auditLogs', model: 'AuditLog' },
]

/**
 * Tables that are deliberately not part of a backup: sessions, and the queue of
 * webhook deliveries — restored, it would send old events again.
 */
export const NOT_BACKED_UP: readonly string[] = ['Session', 'WebhookDelivery']

/** The Prisma client's name for a model: the model name with a small first letter. */
export const delegateName = (model: string): string => model[0].toLowerCase() + model.slice(1)

export const BACKUP_FORMAT = 'baucrew-backup'
/** Version 2 added the tables that came after version 1, and the files. */
export const BACKUP_VERSION = 2
