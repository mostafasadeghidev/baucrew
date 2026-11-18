import { getToolName, isToolUIPart, lastAssistantMessageIsCompleteWithApprovalResponses, type UIMessage } from 'ai'

// The two tools the in-app assistant has that the MCP server does not: they
// run in the person's browser, not on the server. `open_page` takes the
// person to a page of the app (the panel stays open beside it); `ask_user`
// puts a question with a few answers to click. Neither changes anything, so
// neither asks for a confirmation.
//
// Pure and free of server imports: the route describes the tools with it, the
// panel runs them with it, and the tests read it as it is.

export const CLIENT_TOOLS = ['open_page', 'ask_user'] as const
export type ClientToolName = (typeof CLIENT_TOOLS)[number]

export const isClientTool = (name: string): name is ClientToolName => (CLIENT_TOOLS as readonly string[]).includes(name)

/** The app's sections a page may be opened in — the office's pages. Anything else is refused. */
const SECTIONS = [
  'dashboard',
  'projects',
  'customers',
  'employees',
  'vehicles',
  'schedule',
  'warehouse',
  'devices',
  'reports',
  'sites',
  'settings',
  'feedback',
] as const

/**
 * A path the assistant may open: inside the app, in one of its sections, with
 * nothing that could lead elsewhere (no scheme, no `//`, no backslash). The
 * page itself still decides whether the person may see it.
 */
export function safeAppPath(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const path = value.trim()
  if (path.length > 300 || !/^\/[a-z]/.test(path) || /[\\\s]|\/\//.test(path)) return null
  if (!/^[A-Za-z0-9\-._~%/?=&+,:@]+$/.test(path)) return null
  const section = path.slice(1).split(/[/?#]/)[0]
  return (SECTIONS as readonly string[]).includes(section) ? path : null
}

const PAGES = [
  '/dashboard (overview), /dashboard/today',
  '/projects (the board; ?q=<search> filters it), /projects/<id> (one project — use the url from list_projects/get_project), /projects/new, /projects/templates, /projects/drafts',
  '/customers, /customers/<id>, /customers/new',
  '/employees, /employees/<id>',
  '/vehicles, /vehicles/<id>',
  '/schedule (Einsatzplanung; ?week=YYYY-MM-DD shows that week), /schedule/map',
  '/warehouse, /devices, /reports (Auswertungen), /reports/plan, /sites',
  '/settings, /feedback',
].join('; ')

export const CLIENT_TOOL_SPECS: Record<ClientToolName, { description: string; inputSchema: Record<string, unknown> }> = {
  open_page: {
    description:
      `Opens a page of the app in the person's browser — the chat stays open beside it. Use it when they ask to open, show or go to something. ` +
      `Look a record up first and open its url; never guess an id. Pages: ${PAGES}.`,
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The path inside the app, starting with "/", e.g. "/projects/<id>" or "/schedule?week=2026-11-16".' },
        label: { type: 'string', description: 'What is opened, in a few words for the person, e.g. "Projekt 2026-0004 · Innenanstrich Beispielhaus".' },
      },
      required: ['path', 'label'],
      additionalProperties: false,
    },
  },
  ask_user: {
    description:
      'Asks the person a question with 2–6 short answers to click — for choosing between records that match (two customers named alike), ' +
      'or a detail with a few likely answers. They may also type their own answer. Use it instead of asking such a question in text; ' +
      'open questions (a name, an address) are asked in text.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question, short.' },
        options: {
          type: 'array',
          items: { type: 'string' },
          minItems: 2,
          maxItems: 6,
          description: 'The answers to click, each a few words — for records their number and name.',
        },
      },
      required: ['question', 'options'],
      additionalProperties: false,
    },
  },
}

/** A question's input as the panel draws it, or null when the model sent something else. */
export function readQuestion(input: unknown): { question: string; options: string[] } | null {
  if (!input || typeof input !== 'object') return null
  const { question, options } = input as { question?: unknown; options?: unknown }
  if (typeof question !== 'string' || !question.trim() || !Array.isArray(options)) return null
  const clean = options.filter((o): o is string => typeof o === 'string' && o.trim() !== '').slice(0, 6)
  return clean.length >= 1 ? { question: question.trim(), options: clean } : null
}

/** The parts of the latest step of the latest answer. */
function lastStep(messages: UIMessage[]) {
  const message = messages[messages.length - 1]
  if (!message || message.role !== 'assistant') return []
  const start = message.parts.reduce((at, part, i) => (part.type === 'step-start' ? i : at), -1)
  return message.parts.slice(start + 1)
}

/**
 * Whether the answer goes back to the model by itself: a proposal was
 * confirmed or declined, or every tool of the last step has its result and
 * one of them ran here in the browser (a page opened, a question answered).
 * A step of server look-ups alone never sends again — that would loop.
 */
export function shouldContinue({ messages }: { messages: UIMessage[] }): boolean {
  if (lastAssistantMessageIsCompleteWithApprovalResponses({ messages })) return true
  const tools = lastStep(messages).filter(isToolUIPart)
  return (
    tools.some((part) => isClientTool(getToolName(part))) &&
    tools.every((part) => part.state === 'output-available' || part.state === 'output-error' || part.state === 'output-denied')
  )
}

/** The question of the latest answer that still waits for its answer, if any. */
export function openQuestion(messages: UIMessage[]): { toolCallId: string } | null {
  const part = lastStep(messages).find((p) => isToolUIPart(p) && getToolName(p) === 'ask_user' && p.state === 'input-available')
  return part && isToolUIPart(part) ? { toolCallId: part.toolCallId } : null
}

/** Whether the latest answer holds a proposal still waiting for a yes or no. */
export const proposalWaiting = (messages: UIMessage[]): boolean =>
  lastStep(messages).some((p) => isToolUIPart(p) && p.state === 'approval-requested')
