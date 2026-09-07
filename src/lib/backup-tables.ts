// What a backup holds: every table of the app, in the order they depend on
// each other. Parents come first, so a restore can insert straight down the
// list and wipe straight up it. Sessions are the one table left out — they
// belong to a running installation, not to its data.
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
  { key: 'projects', model: 'Project' },
  { key: 'projectWorkCategories', model: 'ProjectWorkCategory' },
  { key: 'projectAddOns', model: 'ProjectAddOn' },
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
  { key: 'documents', model: 'Document' },
  { key: 'timeEntries', model: 'TimeEntry' },
  { key: 'planEntries', model: 'PlanEntry' },
  { key: 'projectDrafts', model: 'ProjectDraft' },
  { key: 'appSettings', model: 'AppSetting' },
  { key: 'apiKeys', model: 'ApiKey' },
  { key: 'auditLogs', model: 'AuditLog' },
]

/** Tables that are deliberately not part of a backup. */
export const NOT_BACKED_UP: readonly string[] = ['Session']

/** The Prisma client's name for a model: the model name with a small first letter. */
export const delegateName = (model: string): string => model[0].toLowerCase() + model.slice(1)

export const BACKUP_FORMAT = 'baucrew-backup'
/** Version 2 added the tables that came after version 1, and the files. */
export const BACKUP_VERSION = 2
