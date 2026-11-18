import 'server-only'
import { z, ZodError, type ZodType } from 'zod'
import { McpContent, McpToolError, type McpTool } from './mcp'
import type { ApiIdentity } from './api-auth'
import {
  AGENT_FEEDBACK_STATUS,
  forbiddenInput,
  inputSchemaFor,
  isToolName,
  mayUse,
  outputFor,
  scopeFits,
  TOOL_SPECS,
  toolNamesFor,
  type ToolName,
} from './mcp-catalog'
import {
  addFeedbackFromAgent,
  addFeedbackNoteFromAgent,
  feedbackImageForAgent,
  getFeedbackForAgent,
  listFeedbackForAgent,
  recordProposalFromAgent,
  setFeedbackStatusFromAgent,
} from './feedback-tools'
import { FEEDBACK_SOURCES, FEEDBACK_STATUSES, WAITING_ON } from './feedback'
import {
  addComment,
  addDefect,
  ApiError,
  cancelScheduleDay,
  cancelScheduleInput,
  commentInput,
  createCustomer,
  createCustomerInput,
  createProject,
  createProjectInput,
  defectInput,
  getCustomer,
  getProject,
  listBoards,
  listTrades,
  listComments,
  listCustomers,
  listDefects,
  listEmployees,
  listProjects,
  listProjectsInput,
  listSchedule,
  listScheduleInput,
  listVehicles,
  moveProjectToColumn,
  moveScheduleDay,
  moveScheduleInput,
  moveToColumnInput,
  patchDefect,
  planEntry,
  planEntryInput,
  planGapsReport,
  projectStatusInput,
  revenueByMonth,
  setProjectStatus,
  updateCustomer,
  updateCustomerInput,
  updateProject,
  updateProjectInput,
  updateScheduleDay,
  updateScheduleInput,
  yearInput,
} from './api-service'
import { addProjectNeeds, addProjectNeedsInput, getProjectNeeds, listCatalog, listCatalogInput } from './project-needs-tools'

export { MCP_SERVER_INFO } from './mcp-catalog'

// The work behind every tool of the catalogue (mcp-catalog.ts): its input
// checked with the same schema the REST API uses, then handed to the service
// layer, so the API, the MCP server and the in-app assistant are three doors
// to the same room. Who may use which tool, and what of its answer they may
// read, is decided here at the door as well as inside — never only in a page.

type Runner = { schema: ZodType; run: (input: never, ctx: ApiIdentity) => Promise<unknown> }

const runner = <T>(schema: ZodType<T>, run: (input: T, ctx: ApiIdentity) => Promise<unknown>): Runner => ({
  schema,
  run: run as Runner['run'],
})

const project = z.object({ project: z.string().trim().min(1) })
const customerUrl = <T extends { id: string }>(c: T) => ({ ...c, url: `/customers/${c.id}` })
const feedbackNumber = z.coerce.number().int().min(1)
const feedbackText = z.string().max(10000)

const RUNNERS: Record<ToolName, Runner> = {
  list_projects: runner(listProjectsInput.omit({ q: true }).extend({ query: z.string().trim().max(200).optional() }), (input, ctx) =>
    listProjects(ctx.user, { ...input, q: input.query })
  ),
  get_project: runner(project, (input, ctx) => getProject(ctx.user, input.project)),
  create_project: runner(createProjectInput, (input, ctx) => createProject(ctx.user, input)),
  update_project: runner(updateProjectInput.extend({ project: z.string().trim().min(1) }), ({ project: id, ...input }, ctx) =>
    updateProject(ctx.user, id, input)
  ),
  set_project_status: runner(projectStatusInput.extend({ project: z.string().trim().min(1) }), (input, ctx) =>
    setProjectStatus(ctx.user, input.project, input.status)
  ),
  list_trades: runner(z.object({}), (_i, ctx) => listTrades(ctx.user)),
  list_boards: runner(z.object({}), (_i, ctx) => listBoards(ctx.user)),
  move_project_to_column: runner(moveToColumnInput, (input, ctx) => moveProjectToColumn(ctx.user, input)),
  list_comments: runner(project, (input, ctx) => listComments(ctx.user, input.project)),
  add_comment: runner(commentInput.extend({ project: z.string().trim().min(1) }), async ({ project: id, ...input }, ctx) => {
    const comment = await addComment(ctx.user, id, input)
    const target = await getProject(ctx.user, id)
    return { ...comment, projectId: target.id, url: target.url }
  }),
  list_defects: runner(project, (input, ctx) => listDefects(ctx.user, input.project)),
  add_defect: runner(defectInput.extend({ project: z.string().trim().min(1) }), ({ project: id, ...input }, ctx) =>
    addDefect(ctx.user, id, input)
  ),
  set_defect_resolved: runner(z.object({ defectId: z.string().min(1), resolved: z.boolean() }), (input, ctx) =>
    patchDefect(ctx.user, input.defectId, { resolved: input.resolved })
  ),
  search_customers: runner(
    z.object({ query: z.string().trim().max(200).optional(), limit: z.coerce.number().int().min(1).max(200).optional() }),
    async (input, ctx) => (await listCustomers(ctx.user, input.query, input.limit)).map(customerUrl)
  ),
  get_customer: runner(z.object({ customerId: z.string().min(1) }), async (input, ctx) =>
    customerUrl(await getCustomer(ctx.user, input.customerId))
  ),
  create_customer: runner(createCustomerInput, async (input, ctx) => customerUrl(await createCustomer(ctx.user, input))),
  update_customer: runner(updateCustomerInput.extend({ customerId: z.string().min(1) }), async ({ customerId, ...input }, ctx) =>
    customerUrl(await updateCustomer(ctx.user, customerId, input))
  ),
  list_catalog: runner(listCatalogInput, (input, ctx) => listCatalog(ctx.user, input)),
  get_project_needs: runner(project, (input, ctx) => getProjectNeeds(ctx.user, input.project)),
  add_project_needs: runner(addProjectNeedsInput, (input, ctx) => addProjectNeeds(ctx.user, input)),
  list_employees: runner(z.object({}), (_i, ctx) => listEmployees(ctx.user)),
  list_vehicles: runner(z.object({}), (_i, ctx) => listVehicles(ctx.user)),
  list_schedule: runner(listScheduleInput, (input, ctx) => listSchedule(ctx.user, input)),
  plan_assignment: runner(planEntryInput, (input, ctx) => planEntry(ctx.user, input)),
  move_schedule_entry: runner(moveScheduleInput, (input, ctx) => moveScheduleDay(ctx.user, input)),
  update_schedule_entry: runner(updateScheduleInput, (input, ctx) => updateScheduleDay(ctx.user, input)),
  cancel_schedule_entry: runner(cancelScheduleInput, (input, ctx) => cancelScheduleDay(ctx.user, input)),
  revenue_by_month: runner(z.object({ year: yearInput }), (input, ctx) => revenueByMonth(ctx.user, input.year)),
  plan_gaps: runner(z.object({ year: yearInput }), (input, ctx) => planGapsReport(ctx.user, input.year)),
  list_feedback: runner(
    z.object({
      status: z.enum(['open', 'all', ...FEEDBACK_STATUSES]).optional(),
      waitingOn: z.enum(['none', ...WAITING_ON]).optional(),
      source: z.enum(FEEDBACK_SOURCES).optional(),
      search: z.string().trim().max(200).optional(),
      numbers: z.array(feedbackNumber).max(200).optional(),
      limit: z.coerce.number().int().min(1).max(200).optional(),
    }),
    (input, ctx) => listFeedbackForAgent(ctx.user, input)
  ),
  get_feedback: runner(z.object({ number: feedbackNumber }), (input, ctx) => getFeedbackForAgent(ctx.user, input.number)),
  get_feedback_image: runner(z.object({ imageId: z.string().trim().min(1) }), (input, ctx) => feedbackImageForAgent(ctx.user, input.imageId)),
  add_feedback: runner(
    z.object({
      comment: feedbackText,
      title: z.string().max(200).optional(),
      page: z.string().max(500).optional(),
      waitingOn: z.enum(WAITING_ON).optional(),
    }),
    (input, ctx) => addFeedbackFromAgent(ctx.user, input)
  ),
  add_feedback_note: runner(z.object({ number: feedbackNumber, body: feedbackText }), (input, ctx) => addFeedbackNoteFromAgent(ctx.user, input)),
  record_feedback_proposal: runner(
    z.object({
      number: feedbackNumber,
      suggestion: feedbackText.optional(),
      beforeText: feedbackText.optional(),
      afterText: feedbackText.optional(),
      completionNote: feedbackText.optional(),
      decision: feedbackText.optional(),
      waitingOn: z.enum(WAITING_ON).nullable().optional(),
    }),
    (input, ctx) => recordProposalFromAgent(ctx.user, input)
  ),
  set_feedback_status: runner(z.object({ number: feedbackNumber, status: z.enum(AGENT_FEEDBACK_STATUS) }), (input, ctx) =>
    setFeedbackStatusFromAgent(ctx.user, input)
  ),
}

/** A refusal or a bad input, in words the assistant can act on. */
function toolError(e: unknown): never {
  if (e instanceof ApiError) throw new McpToolError(e.message)
  if (e instanceof ZodError) {
    throw new McpToolError(`Invalid input: ${e.issues.map((i) => `${i.path.join('.') || 'input'} ${i.message}`).join('; ')}`)
  }
  throw e
}

/**
 * Runs one tool as the caller: refused when their role may not use it or they
 * sent money they may not set, the input checked, the work done, and the
 * answer stripped of money for somebody who may not see it.
 */
export async function runTool(name: string, args: Record<string, unknown>, ctx: ApiIdentity): Promise<unknown> {
  if (!isToolName(name) || !mayUse(ctx.user, TOOL_SPECS[name].access) || !scopeFits(name, ctx.scope)) {
    throw new McpToolError(`Unknown tool: ${name}`)
  }
  const forbidden = forbiddenInput(name, ctx.user, args)
  if (forbidden.length > 0) throw new McpToolError(`This user may not set: ${forbidden.join(', ')}`)
  const { schema, run } = RUNNERS[name]
  try {
    const result = await run(schema.parse(args) as never, ctx)
    // A picture is passed on as it is; everything else loses what this user may not see.
    return result instanceof McpContent ? result : outputFor(ctx.user, result)
  } catch (e) {
    toolError(e)
  }
}

/** The tools as the MCP server offers them to this caller — only those their role and key may use. */
export function mcpToolsFor(ctx: ApiIdentity): McpTool<ApiIdentity>[] {
  return toolNamesFor(ctx.user, ctx.scope).map((name) => ({
    name,
    description: TOOL_SPECS[name].description,
    inputSchema: inputSchemaFor(name, ctx.user),
    run: (args, c) => runTool(name, args, c),
  }))
}
