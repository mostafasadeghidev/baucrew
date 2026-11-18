import { canViewFinancials, isOffice } from './authz'
import type { McpServerInfo } from './mcp'
import type { ApiKeyScope } from './api-keys'

// What an AI assistant may do in BauCrew, described without doing it: every
// tool's name, what it is for, the input it takes, who may use it, and
// whether it only reads or changes something. The MCP server and the in-app
// assistant both build on this list (the work itself is in mcp-tools.ts),
// so the two can never offer different things — and the rules below are
// plain functions a test can check without a database.

/**
 * Who may use a tool, by the same lines the pages draw:
 * - staff: the office and the site managers (`requireStaff`); a site manager
 *   sees only the projects they are named on — the service layer narrows that.
 * - office: admin and manager (`requireManagement`) — customers, the master data.
 * - financials: who may see money (`canViewFinancials`) — revenue, plan gaps.
 */
export type ToolAccess = 'staff' | 'office' | 'financials'

/** A read runs at once; a write is shown to the person as a proposal first. */
export type ToolKind = 'read' | 'write'

export type ToolSpec = {
  description: string
  inputSchema: Record<string, unknown>
  access: ToolAccess
  kind: ToolKind
  /** Input fields only somebody who may see money is offered (and may send). */
  financialFields?: string[]
  /**
   * The part of the app the tool belongs to, when a limited API key may use it:
   * a "feedback" key is offered exactly the tools of that group.
   */
  group?: ApiKeyScope
  /** Offered over MCP only, not in the in-app assistant — the coding agent's tools. */
  mcpOnly?: boolean
}

/** The user as far as these rules care. */
export type ToolUser = { role: string; canViewFinancials: boolean }

export const MCP_SERVER_INFO: McpServerInfo = {
  name: 'BauCrew',
  version: '2',
  instructions: [
    'BauCrew is the office system of a painting and construction company: projects, customers, employees, vehicles, the schedule (who works where on which day), the project boards and revenue reports.',
    'Dates are calendar days as YYYY-MM-DD; amounts are euros. Project statuses: LEAD, QUOTED, APPROVED, PLANNED, IN_PROGRESS, COMPLETED, INVOICED, PAID, CANCELLED.',
    "A project has two numbers: the app's own number like 2026-0048 (never changes) and the client's Projektnummer (jobNumber) like 1234567. Either finds a project.",
    "You act as one user, with that user's role and financial access; price fields are simply absent when that user may not see them, and tools that user may not use are not offered.",
    'Find ids with the list and search tools first. Before creating or changing anything, tell the person what you are about to do.',
  ].join(' '),
}

const FEEDBACK_STATUS = ['INBOX', 'TODO', 'DECISION', 'IN_PROGRESS', 'DONE', 'CLOSED']
/** What an agent may set: the open statuses. Done and closed stay with a person. */
export const AGENT_FEEDBACK_STATUS = ['INBOX', 'TODO', 'DECISION', 'IN_PROGRESS'] as const
const WAITING_ON = ['agent', 'owner', 'teammate', 'client']
const feedbackNumber = { type: 'integer', minimum: 1, description: 'The item number, e.g. 64 for #64' }

export const PROJECT_STATUSES = ['LEAD', 'QUOTED', 'APPROVED', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'PAID', 'CANCELLED']
const STATUS = PROJECT_STATUSES

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
})
const str = (description: string) => ({ type: 'string', description })
const nullableStr = (description: string) => ({ type: ['string', 'null'], description: `${description}; null clears it` })
const date = (description: string) => ({ type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: `${description} (YYYY-MM-DD)` })
const nullableDate = (description: string) => ({
  type: ['string', 'null'],
  pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  description: `${description} (YYYY-MM-DD); null clears it`,
})
const ids = (description: string) => ({ type: 'array', items: { type: 'string' }, description })
const year = { type: 'integer', minimum: 2000, maximum: 2100 }
const project = str('Project id, its number like 2026-0048, or its Projektnummer')

const customerFields = {
  name: str('Customer name'),
  number: str("Customer number in the office's own books"),
  company: str('Company'),
  contactPerson: str('Contact person'),
  phone: str('Phone'),
  email: str('E-mail'),
  street: str('Street'),
  postalCode: str('Postal code'),
  city: str('Town'),
  notes: str('Notes'),
}

export const TOOL_SPECS = {
  // ── Projects ──────────────────────────────────────────────────────
  list_projects: {
    access: 'staff',
    kind: 'read',
    description:
      'Projects, newest first. Filter by a free-text query (name, number, Projektnummer, customer, town) and/or a status. Returns id, number, jobNumber, name, status, customer, address, dates, the page url and — when allowed — price and order value.',
    inputSchema: obj({
      query: str('Text to look for in name, number, Projektnummer, customer or town'),
      status: { type: 'string', enum: STATUS, description: 'Only projects in this status' },
      limit: { type: 'integer', minimum: 1, maximum: 200, description: 'How many at most (default 50)' },
      offset: { type: 'integer', minimum: 0, description: 'Skip this many (paging)' },
    }),
  },
  get_project: {
    access: 'staff',
    kind: 'read',
    description:
      'One project in full: team, vehicles, every day it is on the schedule (with the schedule entry ids), the work order (Arbeitsauftrag) url and (when allowed) its lines in the year plan.',
    inputSchema: obj({ project }, ['project']),
  },
  create_project: {
    access: 'staff',
    kind: 'write',
    description:
      'Creates a project. Give customerId, or customerName to find the customer by name (created when unknown). The project is named after its customer, its trades and its work note ("Muster GmbH · Malern, Küche"), so give the trades (names from list_trades) and put what no trade says in workNote. Dates YYYY-MM-DD, price in euros (only for users who may see prices).',
    financialFields: ['price'],
    inputSchema: obj(
      {
        trades: { type: 'array', items: { type: 'string' }, description: 'The work, by trade name from list_trades, e.g. ["Malern"]' },
        workNote: str('The type of work in free words where no trade says it, e.g. Küche'),
        name: str('Optional extra title, shown only while the project has neither trade nor work note'),
        jobNumber: str("The client's own Projektnummer, e.g. 1234567"),
        customerId: str('Customer id from search_customers'),
        customerName: str('Customer name, used when there is no customerId'),
        status: { type: 'string', enum: STATUS, description: 'Default LEAD' },
        isSub: { type: 'boolean', description: 'True when a subcontractor does the work' },
        plannedStart: date('Planned start'),
        plannedEnd: date('Planned end'),
        dueDate: date('The day the work has to be done by'),
        price: { type: 'number', description: 'Order value in euros' },
        street: str('Site street'),
        postalCode: str('Site postal code'),
        city: str('Site town'),
        description: str('Free text'),
      },
      []
    ),
  },
  update_project: {
    access: 'staff',
    kind: 'write',
    description:
      'Changes the details of a project: trades and work note (which also rename it), Projektnummer, site address, dates, the site manager, the description and (when allowed) the price. Only the fields sent change; null clears a field. To change the status use set_project_status or move_project_to_column.',
    financialFields: ['price'],
    inputSchema: obj(
      {
        project,
        trades: { type: 'array', items: { type: 'string' }, description: 'All the trades by name from list_trades; the ones left out are taken off' },
        workNote: nullableStr('The type of work in free words where no trade says it; null clears it'),
        name: str('Extra title, shown only while the project has neither trade nor work note'),
        jobNumber: nullableStr("The client's own Projektnummer"),
        street: nullableStr('Site street'),
        postalCode: nullableStr('Site postal code'),
        city: nullableStr('Site town'),
        plannedStart: nullableDate('Planned start'),
        plannedEnd: nullableDate('Planned end'),
        dueDate: nullableDate('The day the work has to be done by'),
        inspectionDate: nullableDate('Day of the site visit'),
        executionWish: nullableStr("When the customer would like the work, in the customer's words"),
        managerId: { type: ['string', 'null'], description: 'Employee id of the site manager (Bauleitung); null takes it away' },
        isSub: { type: 'boolean', description: 'True when a subcontractor does the work' },
        description: nullableStr('Free text'),
        price: { type: ['number', 'null'], description: 'Order value in euros' },
      },
      ['project']
    ),
  },
  set_project_status: {
    access: 'staff',
    kind: 'write',
    description:
      "Changes a project's status. Moving to IN_PROGRESS or COMPLETED fills the actual start/end from the schedule where they are empty.",
    inputSchema: obj({ project, status: { type: 'string', enum: STATUS } }, ['project', 'status']),
  },
  list_trades: {
    access: 'staff',
    kind: 'read',
    description: 'The trades (work types) a project can have, e.g. Malern, Trockenbau. A project is named after its customer, its trades and its work note (what no trade says).',
    inputSchema: obj({}),
  },
  list_boards: {
    access: 'staff',
    kind: 'read',
    description:
      'The project boards and their columns (lists), left to right: each column holds one status, some only part of it by a rule (paused, nextYear, lowPriority, invoice1, or a Trello list).',
    inputSchema: obj({}),
  },
  move_project_to_column: {
    access: 'staff',
    kind: 'write',
    description:
      "Puts a project into a column of a board as if its card were dragged there: the column's status, plus what the column's rule asks (on hold, low priority, next year). Column ids from list_boards.",
    inputSchema: obj({ project, columnId: str('Column id from list_boards') }, ['project', 'columnId']),
  },
  list_comments: {
    access: 'staff',
    kind: 'read',
    description: 'The comments on a project, oldest first.',
    inputSchema: obj({ project }, ['project']),
  },
  add_comment: {
    access: 'staff',
    kind: 'write',
    description: 'Writes a comment on a project as the user. office=true keeps it from the crew.',
    inputSchema: obj({ project, body: str('The comment'), office: { type: 'boolean', description: 'Only for the office' } }, [
      'project',
      'body',
    ]),
  },
  list_defects: {
    access: 'staff',
    kind: 'read',
    description: 'The defects (Mängel) of a project, open ones first.',
    inputSchema: obj({ project }, ['project']),
  },
  add_defect: {
    access: 'staff',
    kind: 'write',
    description: 'Reports a defect on a project.',
    inputSchema: obj(
      {
        project,
        title: str('Short title'),
        description: str('What is wrong'),
        location: str('Where on the site, e.g. "Bad OG, Decke"'),
        dueDate: date('To be put right by'),
        assigneeId: str('Employee id who puts it right'),
      },
      ['project', 'title']
    ),
  },
  set_defect_resolved: {
    access: 'staff',
    kind: 'write',
    description: 'Marks a defect as put right (resolved=true) or opens it again.',
    inputSchema: obj({ defectId: str('Defect id from list_defects'), resolved: { type: 'boolean' } }, ['defectId', 'resolved']),
  },

  // ── Customers ─────────────────────────────────────────────────────
  search_customers: {
    access: 'office',
    kind: 'read',
    description: 'Customers by name, number, company or town; without a query, the first 50 by name.',
    inputSchema: obj({ query: str('Text to look for'), limit: { type: 'integer', minimum: 1, maximum: 200 } }),
  },
  get_customer: {
    access: 'office',
    kind: 'read',
    description: 'One customer with contact details and how many projects they have.',
    inputSchema: obj({ customerId: str('Customer id') }, ['customerId']),
  },
  create_customer: {
    access: 'office',
    kind: 'write',
    description: 'Creates a customer. Only the name is required.',
    inputSchema: obj(customerFields, ['name']),
  },
  update_customer: {
    access: 'office',
    kind: 'write',
    description: "Changes a customer's details; only the fields sent change, null clears a field.",
    inputSchema: obj(
      {
        customerId: str('Customer id'),
        ...Object.fromEntries(Object.entries(customerFields).map(([k, v]) => [k, k === 'name' ? v : nullableStr(v.description)])),
      },
      ['customerId']
    ),
  },

  // ── People, vehicles, schedule ────────────────────────────────────
  // ── What a job needs ─────────────────────────────────────────────
  list_catalog: {
    access: 'staff',
    kind: 'read',
    description:
      "The company's catalogue of materials and tools (Lager), searched by name or category. Kinds are MATERIAL and TOOL plus any the company added. Machines are not in it: they come from Wattro (see get_project_needs).",
    inputSchema: obj({
      query: str('Text to look for in the name or category'),
      kind: str('Only entries of this kind, e.g. MATERIAL or TOOL'),
      limit: { type: 'integer', minimum: 1, maximum: 500, description: 'How many at most (default 200)' },
    }),
  },
  get_project_needs: {
    access: 'staff',
    kind: 'read',
    description:
      'What a project needs: its materials and tools (kind, name, quantity, unit, status REQUIRED/COLLECTED/MISSING, note) and the machines noted for it.',
    inputSchema: obj({ project }, ['project']),
  },
  add_project_needs: {
    access: 'staff',
    kind: 'write',
    description:
      'Adds materials and tools to a project by name, matched against the catalogue (plurals and close names are found; when several fit, nothing is guessed and the candidates come back). An entry already on the list only gets an empty quantity or note filled. Machines by name or inventory number. Names the catalogue does not know come back in notInCatalog — with createMissing they are made as new catalogue entries (office only).',
    inputSchema: obj(
      {
        project,
        items: {
          type: 'array',
          description: 'Materials and tools',
          items: obj(
            {
              name: str('Name as written, e.g. "Dispersionsfarbe weiß"'),
              quantity: { type: 'number', minimum: 0, description: 'How many, in the entry’s unit' },
              note: str('A note for the crew'),
              kind: str('MATERIAL or TOOL, when the name alone is not clear'),
            },
            ['name']
          ),
        },
        machines: ids('Machines by name or inventory number'),
        createMissing: { type: 'boolean', description: 'Make unknown names as new catalogue entries (office only)' },
      },
      ['project']
    ),
  },
  list_employees: {
    access: 'staff',
    kind: 'read',
    description: 'Active employees with their ids, phones and skills.',
    inputSchema: obj({}),
  },
  list_vehicles: {
    access: 'staff',
    kind: 'read',
    description: 'Active vehicles with their ids and licence plates.',
    inputSchema: obj({}),
  },
  list_schedule: {
    access: 'staff',
    kind: 'read',
    description:
      'Who works where between two days (inclusive): every schedule entry with its id, project, employees and vehicles. Optionally only one project, one employee or one vehicle.',
    inputSchema: obj(
      {
        from: date('First day'),
        to: date('Last day'),
        projectId: str('Only this project (id)'),
        employeeId: str('Only days this employee is out on'),
        vehicleId: str('Only days this vehicle is out'),
      },
      ['from', 'to']
    ),
  },
  plan_assignment: {
    access: 'staff',
    kind: 'write',
    description:
      'Puts a project on the schedule for one day, or every working day from date to endDate (31 days at most; Saturdays and Sundays only when asked). Employees and vehicles by id. A day the project already has is skipped.',
    inputSchema: obj(
      {
        projectId: project,
        date: date('The day, or the first day of a range'),
        endDate: date('Last day of a range'),
        saturday: { type: 'boolean', description: 'Also plan Saturdays in the range' },
        sunday: { type: 'boolean', description: 'Also plan Sundays in the range' },
        employeeIds: ids('Employees on site'),
        vehicleIds: ids('Vehicles on site'),
        startTime: str('Start of day like 07:30 (optional)'),
        endTime: str('End of day like 16:00 (optional)'),
        note: str('Note for the crew; it stands on the work order of that day'),
      },
      ['projectId', 'date']
    ),
  },
  move_schedule_entry: {
    access: 'staff',
    kind: 'write',
    description: 'Moves one schedule entry (one day of a project) to another day, crew and vehicles along.',
    inputSchema: obj({ entryId: str('Schedule entry id from list_schedule or get_project'), date: date('The new day') }, [
      'entryId',
      'date',
    ]),
  },
  update_schedule_entry: {
    access: 'staff',
    kind: 'write',
    description:
      'Changes one day on the schedule: its whole crew (employeeIds), its vehicles, its hours or its note. Lists replace what the day has; fields not sent stay.',
    inputSchema: obj(
      {
        entryId: str('Schedule entry id'),
        employeeIds: ids('The employees of that day'),
        vehicleIds: ids('The vehicles of that day'),
        startTime: { type: ['string', 'null'], description: 'Start like 07:30; null clears it' },
        endTime: { type: ['string', 'null'], description: 'End like 16:00; null clears it' },
        note: nullableStr('Note for the crew'),
      },
      ['entryId']
    ),
  },
  cancel_schedule_entry: {
    access: 'staff',
    kind: 'write',
    description: 'Takes one day out of the schedule. It is cancelled, not deleted: planning the day again brings it back.',
    inputSchema: obj({ entryId: str('Schedule entry id') }, ['entryId']),
  },

  // ── Reports ───────────────────────────────────────────────────────
  revenue_by_month: {
    access: 'financials',
    kind: 'read',
    description:
      'The month-by-month turnover of a year as the reports show it: own crew and subcontractor totals, every row, and projects the year plan does not know.',
    inputSchema: obj({ year }, ['year']),
  },
  plan_gaps: {
    access: 'financials',
    kind: 'read',
    description: 'Lines of the year plan that are not tied to any project yet — what was planned but never made it into the system.',
    inputSchema: obj({ year }, ['year']),
  },

  // ── Feedback (the list a coding agent works off; docs/CHANGE-feedback-tool.md) ──
  list_feedback: {
    access: 'staff',
    kind: 'read',
    group: 'feedback',
    mcpOnly: true,
    description:
      'The feedback items: requests about the app left by the office, the crew or an agent, each with its comment, the page and element it was left on, notes, the proposal and its decisions. Default: the open ones (INBOX, TODO, DECISION, IN_PROGRESS), by number. The answer starts with instructions — follow them: status DECISION waits on a person; act on an accept only while evidenceMatchesCurrent is true. Screenshots: get_feedback_image with an image id.',
    inputSchema: obj({
      status: { type: 'string', enum: ['open', 'all', ...FEEDBACK_STATUS], description: 'open (default), all, or one status' },
      waitingOn: { type: 'string', enum: ['none', ...WAITING_ON], description: 'Only items waiting on this one (none: on nobody)' },
      source: { type: 'string', enum: ['comment', 'checklist', 'agent'], description: 'Only items from this source' },
      search: str('Words to look for in title, comment, page, proposal and notes'),
      numbers: { type: 'array', items: { type: 'integer', minimum: 1 }, description: 'Only these item numbers (any status)' },
      limit: { type: 'integer', minimum: 1, maximum: 200, description: 'How many at most (default 50)' },
    }),
  },
  get_feedback: {
    access: 'staff',
    kind: 'read',
    group: 'feedback',
    mcpOnly: true,
    description: 'One feedback item in full by its number, with notes, decisions, status history and its image ids.',
    inputSchema: obj({ number: feedbackNumber }, ['number']),
  },
  get_feedback_image: {
    access: 'staff',
    kind: 'read',
    group: 'feedback',
    mcpOnly: true,
    description: "One of a feedback item's pictures (a screenshot, an upload, a proposal's before or after), by the image id from list_feedback or get_feedback.",
    inputSchema: obj({ imageId: str('Image id') }, ['imageId']),
  },
  add_feedback: {
    access: 'staff',
    kind: 'write',
    group: 'feedback',
    mcpOnly: true,
    description:
      'Adds a feedback item (source "agent") — something found while working that a person should see or decide. It lands in INBOX. No real customer names or addresses in it.',
    inputSchema: obj(
      {
        comment: str('What it is about, in plain words'),
        title: str('A short title (default: the start of the comment)'),
        page: str('The app page it is about, e.g. /projects or /schedule'),
        waitingOn: { type: 'string', enum: WAITING_ON, description: 'Who has to act next' },
      },
      ['comment']
    ),
  },
  add_feedback_note: {
    access: 'staff',
    kind: 'write',
    group: 'feedback',
    mcpOnly: true,
    description:
      'Adds a note to a feedback item: a question, what was found, what was done and where (branch, pull request). Accepting or rejecting a proposal stays with a person.',
    inputSchema: obj({ number: feedbackNumber, body: str('The note') }, ['number', 'body']),
  },
  record_feedback_proposal: {
    access: 'office',
    kind: 'write',
    group: 'feedback',
    mcpOnly: true,
    description:
      "Records the agent's proposal on a feedback item for a person to accept or reject: what it suggests, optionally a before and after text (shown as a diff), what was done, and an open question. Only the fields sent change. Recording a new proposal makes earlier decisions out of date.",
    inputSchema: obj(
      {
        number: feedbackNumber,
        suggestion: str('The proposal, in plain words'),
        beforeText: str('Text as it is now (copy, code or a description)'),
        afterText: str('Text as it would be'),
        completionNote: str('What was done, where to look (branch, pull request, how to test)'),
        decision: str('The question a person has to answer before it can be built; empty to clear'),
        waitingOn: { type: ['string', 'null'], enum: [...WAITING_ON, null], description: 'Who has to act next; null for nobody' },
      },
      ['number']
    ),
  },
  set_feedback_status: {
    access: 'office',
    kind: 'write',
    group: 'feedback',
    mcpOnly: true,
    description:
      'Moves a feedback item to INBOX, TODO, DECISION (a person has to decide: put the question in record_feedback_proposal first) or IN_PROGRESS. Done and closed are set by a person after checking.',
    inputSchema: obj({ number: feedbackNumber, status: { type: 'string', enum: [...AGENT_FEEDBACK_STATUS] } }, ['number', 'status']),
  },
} satisfies Record<string, ToolSpec>

export type ToolName = keyof typeof TOOL_SPECS

export const TOOL_NAMES = Object.keys(TOOL_SPECS) as ToolName[]

const specOf = (name: ToolName): ToolSpec => TOOL_SPECS[name]

/** Whether a caller with this key scope may be offered the tool: a limited key only its own group. */
export const scopeFits = (name: ToolName, scope: ApiKeyScope | null = null): boolean => scope === null || specOf(name).group === scope

export const isToolName = (name: string): name is ToolName => Object.hasOwn(TOOL_SPECS, name)

/** Whether this user may use a tool of that access at all. The crew may use none. */
export function mayUse(user: ToolUser, access: ToolAccess): boolean {
  if (user.role !== 'ADMIN' && user.role !== 'MANAGER' && user.role !== 'SITE_MANAGER') return false
  if (access === 'staff') return true
  if (access === 'office') return isOffice(user)
  return canViewFinancials(user)
}

/** The tools this user is offered over MCP, in the catalogue's order — with a limited key, only its group. */
export function toolNamesFor(user: ToolUser, scope: ApiKeyScope | null = null): ToolName[] {
  return TOOL_NAMES.filter((name) => mayUse(user, specOf(name).access) && scopeFits(name, scope))
}

/** The tools the in-app assistant is offered: the same, without the coding agent's. */
export function assistantToolNamesFor(user: ToolUser): ToolName[] {
  return toolNamesFor(user).filter((name) => !specOf(name).mcpOnly)
}

export const isWriteTool = (name: string): boolean => isToolName(name) && specOf(name).kind === 'write'

/** The input schema as this user is offered it: without the money fields for somebody who may not see money. */
export function inputSchemaFor(name: ToolName, user: ToolUser): Record<string, unknown> {
  const spec = specOf(name)
  if (!spec.financialFields?.length || canViewFinancials(user)) return spec.inputSchema
  const properties = { ...(spec.inputSchema.properties as Record<string, unknown>) }
  for (const field of spec.financialFields) delete properties[field]
  return { ...spec.inputSchema, properties }
}

/** Input fields this user sent but may not send — the money, for somebody without financial access. */
export function forbiddenInput(name: ToolName, user: ToolUser, args: Record<string, unknown>): string[] {
  if (canViewFinancials(user)) return []
  return (specOf(name).financialFields ?? []).filter((f) => args[f] !== undefined)
}

/**
 * Every key that carries money in what the service layer hands back. The
 * service already leaves them out for somebody who may not see money; this
 * is the second lock, at the door the assistant reads from, so a field added
 * to a DTO one day without its check still never reaches them.
 */
export const FINANCIAL_KEYS = new Set([
  'price',
  'orderValue',
  'invoices',
  'planLines',
  'amount',
  'addOns',
  'revenue',
  'yearTotal',
  'ownCrew',
  'undated',
  'undatedHistorical',
])

/** A copy of a tool's output without any money in it, however deep. */
export function withoutFinancials<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutFinancials) as T
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !FINANCIAL_KEYS.has(key))
        .map(([key, v]) => [key, withoutFinancials(v)])
    ) as T
  }
  return value
}

/** A tool's output as this user may read it. */
export function outputFor<T>(user: ToolUser, value: T): T {
  return canViewFinancials(user) ? value : withoutFinancials(value)
}
