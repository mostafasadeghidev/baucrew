import 'server-only'
import { z, ZodError, type ZodType } from 'zod'
import { McpToolError, type McpServerInfo, type McpTool } from './mcp'
import type { ApiIdentity } from './api-auth'
import {
  ApiError,
  createCustomer,
  createCustomerInput,
  createProject,
  createProjectInput,
  getProject,
  listCustomers,
  listEmployees,
  listProjects,
  listProjectsInput,
  listSchedule,
  listScheduleInput,
  listVehicles,
  planEntry,
  planEntryInput,
  planGapsReport,
  projectStatusInput,
  revenueByMonth,
  setProjectStatus,
  yearInput,
} from './api-service'

// What an AI assistant may do in BauCrew, as MCP tools. Each one checks its
// input with the same schema the REST API uses and hands the work to the
// service layer, so the two doors lead to the same room.

export const MCP_SERVER_INFO: McpServerInfo = {
  name: 'BauCrew',
  version: '1',
  instructions: [
    'BauCrew is the office system of a painting and construction company: projects, customers, employees, vehicles, the schedule (who works where on which day) and revenue reports.',
    'Dates are calendar days as YYYY-MM-DD; amounts are euros. Project statuses: LEAD, QUOTED, APPROVED, PLANNED, IN_PROGRESS, COMPLETED, INVOICED, PAID, CANCELLED.',
    'You act as the user the API key belongs to, with that user\'s role and financial access; price fields are simply absent when that user may not see them.',
    'Find ids with the list and search tools first. Before creating or changing anything, tell the person what you are about to do.',
  ].join(' '),
}

const STATUS = ['LEAD', 'QUOTED', 'APPROVED', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'PAID', 'CANCELLED']

/** Runs a tool body and turns a refusal or a bad input into words the assistant can act on. */
async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof ApiError) throw new McpToolError(e.message)
    if (e instanceof ZodError) {
      throw new McpToolError(`Invalid input: ${e.issues.map((i) => `${i.path.join('.') || 'input'} ${i.message}`).join('; ')}`)
    }
    throw e
  }
}

const parse = <T>(schema: ZodType<T>, args: unknown): T => schema.parse(args)

const tool = <T>(
  name: string,
  description: string,
  inputSchema: Record<string, unknown>,
  schema: ZodType<T>,
  run: (input: T, ctx: ApiIdentity) => Promise<unknown>
): McpTool<ApiIdentity> => ({
  name,
  description,
  inputSchema,
  run: (args, ctx) => guarded(() => run(parse(schema, args), ctx)),
})

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
})
const str = (description: string) => ({ type: 'string', description })
const date = (description: string) => ({ type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: `${description} (YYYY-MM-DD)` })
const ids = (description: string) => ({ type: 'array', items: { type: 'string' }, description })

export const mcpTools: McpTool<ApiIdentity>[] = [
  tool(
    'list_projects',
    'Projects, newest first. Filter by a free-text query (name, number, customer, town) and/or a status. Returns id, number, name, status, customer, dates and — when allowed — price and order value.',
    obj({
      query: str('Text to look for in name, number, customer or town'),
      status: { type: 'string', enum: STATUS, description: 'Only projects in this status' },
      limit: { type: 'integer', minimum: 1, maximum: 200, description: 'How many at most (default 50)' },
      offset: { type: 'integer', minimum: 0, description: 'Skip this many (paging)' },
    }),
    listProjectsInput.omit({ q: true }).extend({ query: z.string().trim().max(200).optional() }),
    (input, ctx) => listProjects(ctx.user, { ...input, q: input.query })
  ),
  tool(
    'get_project',
    'One project in full: team, vehicles, every day it is on the schedule, and (when allowed) its lines in the year plan. Takes the id or the number like 2026-0048.',
    obj({ project: str('Project id or number') }, ['project']),
    z.object({ project: z.string().trim().min(1) }),
    (input, ctx) => getProject(ctx.user, input.project)
  ),
  tool(
    'create_project',
    'Creates a project. Give customerId, or customerName to find the customer by name (created when unknown). Dates YYYY-MM-DD, price in euros (only kept when the user may see prices). Confirm with the person first.',
    obj(
      {
        name: str('Project name, e.g. "Musterhof Fassade"'),
        customerId: str('Customer id from search_customers'),
        customerName: str('Customer name, used when there is no customerId'),
        status: { type: 'string', enum: STATUS, description: 'Default LEAD' },
        isSub: { type: 'boolean', description: 'True when a subcontractor does the work' },
        plannedStart: date('Planned start'),
        plannedEnd: date('Planned end'),
        price: { type: 'number', description: 'Order value in euros' },
        street: str('Site street'),
        postalCode: str('Site postal code'),
        city: str('Site town'),
        description: str('Free text'),
      },
      ['name']
    ),
    createProjectInput,
    (input, ctx) => createProject(ctx.user, input)
  ),
  tool(
    'set_project_status',
    'Changes a project\'s status (id or number). Moving to IN_PROGRESS or COMPLETED fills the actual start/end from the schedule where they are empty.',
    obj({ project: str('Project id or number'), status: { type: 'string', enum: STATUS } }, ['project', 'status']),
    projectStatusInput.extend({ project: z.string().trim().min(1) }),
    (input, ctx) => setProjectStatus(ctx.user, input.project, input.status)
  ),
  tool(
    'search_customers',
    'Customers by name, company or town; without a query, the first 50 by name.',
    obj({ query: str('Text to look for'), limit: { type: 'integer', minimum: 1, maximum: 200 } }),
    z.object({ query: z.string().trim().max(200).optional(), limit: z.coerce.number().int().min(1).max(200).optional() }),
    (input, ctx) => listCustomers(ctx.user, input.query, input.limit)
  ),
  tool(
    'create_customer',
    'Creates a customer. Only the name is required.',
    obj(
      {
        name: str('Customer name'),
        company: str('Company'),
        contactPerson: str('Contact person'),
        phone: str('Phone'),
        email: str('E-mail'),
        street: str('Street'),
        postalCode: str('Postal code'),
        city: str('Town'),
        notes: str('Notes'),
      },
      ['name']
    ),
    createCustomerInput,
    (input, ctx) => createCustomer(ctx.user, input)
  ),
  tool('list_employees', 'Active employees with their ids, phones and skills.', obj({}), z.object({}), (_i, ctx) =>
    listEmployees(ctx.user)
  ),
  tool('list_vehicles', 'Active vehicles with their ids and licence plates.', obj({}), z.object({}), (_i, ctx) =>
    listVehicles(ctx.user)
  ),
  tool(
    'list_schedule',
    'Who works where between two days (inclusive): every schedule entry with its project, employees and vehicles. Optionally for one project only.',
    obj({ from: date('First day'), to: date('Last day'), projectId: str('Only this project (id)') }, ['from', 'to']),
    listScheduleInput,
    (input, ctx) => listSchedule(ctx.user, input)
  ),
  tool(
    'plan_assignment',
    'Puts a project on the schedule for one day, or every working day from date to endDate (31 days at most; Saturdays and Sundays only when asked). Employees and vehicles by id. A day the project already has is skipped. Confirm with the person first.',
    obj(
      {
        projectId: str('Project id or number'),
        date: date('The day, or the first day of a range'),
        endDate: date('Last day of a range'),
        saturday: { type: 'boolean', description: 'Also plan Saturdays in the range' },
        sunday: { type: 'boolean', description: 'Also plan Sundays in the range' },
        employeeIds: ids('Employees on site'),
        vehicleIds: ids('Vehicles on site'),
        startTime: str('Start of day like 07:30 (optional)'),
        endTime: str('End of day like 16:00 (optional)'),
        note: str('Note for the crew'),
      },
      ['projectId', 'date']
    ),
    planEntryInput,
    (input, ctx) => planEntry(ctx.user, input)
  ),
  tool(
    'revenue_by_month',
    'The month-by-month turnover of a year as the reports show it: own crew and subcontractor totals, every row, and projects the year plan does not know. Financial access required.',
    obj({ year: { type: 'integer', minimum: 2000, maximum: 2100 } }, ['year']),
    z.object({ year: yearInput }),
    (input, ctx) => revenueByMonth(ctx.user, input.year)
  ),
  tool(
    'plan_gaps',
    'Lines of the year plan that are not tied to any project yet — what was planned but never made it into the system. Financial access required.',
    obj({ year: { type: 'integer', minimum: 2000, maximum: 2100 } }, ['year']),
    z.object({ year: yearInput }),
    (input, ctx) => planGapsReport(ctx.user, input.year)
  ),
]
