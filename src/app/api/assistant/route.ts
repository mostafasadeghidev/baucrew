import { NextResponse } from 'next/server'
import { getLocale, getTranslations } from 'next-intl/server'
import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStreamResponse,
  isStepCount,
  jsonSchema,
  safeValidateUIMessages,
  streamText,
  tool,
  toUIMessageStream,
  type ToolSet,
  type UIMessage,
} from 'ai'
import { getCurrentUser } from '@/lib/auth'
import type { ApiIdentity } from '@/lib/api-auth'
import { McpToolError } from '@/lib/mcp'
import { assistantToolNamesFor, inputSchemaFor, isWriteTool, MCP_SERVER_INFO, PROJECT_STATUSES, TOOL_SPECS } from '@/lib/mcp-catalog'
import { runTool } from '@/lib/mcp-tools'
import { approvalSecret, assistantModel } from '@/lib/assistant'
import { describeProposal } from '@/lib/assistant-proposal'
import { CLIENT_TOOL_SPECS, CLIENT_TOOLS, safeAppPath } from '@/lib/assistant-client-tools'
import { isChatId } from '@/lib/assistant-history'
import { mayWriteChat, saveChat } from '@/lib/assistant-chats'
import { todayUtc } from '@/lib/dates'

// The in-app assistant: the signed-in user talks, the model answers and uses
// the same tools the MCP server offers — as that user, with that user's
// rights, nothing more. A tool that changes something is not run when the
// model asks for it: the person sees the proposal and confirms it first, and
// only a confirmation this server signed counts. The answer streams, and the
// conversation is kept for the person (assistant-chats.ts). Two tools run in
// the browser instead (assistant-client-tools.ts): opening a page, and a
// question with answers to click.

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** How much of a conversation is sent back to the model: the latest messages. */
const HISTORY = 40
/** How much of it is kept at most. */
const KEPT = 400

const messageId = createIdGenerator({ prefix: 'msg', size: 16 })

/** What the page behind the panel tells the model: where the person is, and which record "this" means. */
function pageContext(page: string | null): string {
  if (!page) return ''
  const record = page.match(/^\/(projects|projects\/card|customers|employees|vehicles)\/([\w-]+)(?:[/?#]|$)/)
  const kind = record?.[1] === 'projects/card' ? 'projects' : record?.[1]
  return (
    `The person is looking at the page ${page}.` +
    (record && !['new', 'templates', 'drafts', 'checklists', 'forms', 'import'].includes(record[2])
      ? ` It shows the ${kind!.replace(/s$/, '')} with id ${record[2]} — "this one" or "hier" means that record; look it up by that id.`
      : '')
  )
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const names = assistantToolNamesFor(user)
  if (names.length === 0) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const model = assistantModel()
  if (!model) return NextResponse.json({ error: 'notConfigured' }, { status: 503 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid' }, { status: 400 })
  }
  const { id: chatId, messages: raw, page } = (body ?? {}) as { id?: unknown; messages?: unknown; page?: unknown }
  if (!isChatId(chatId) || !(await mayWriteChat(user.id, chatId))) return NextResponse.json({ error: 'notFound' }, { status: 404 })
  const checked = await safeValidateUIMessages<UIMessage>({ messages: Array.isArray(raw) ? raw.slice(-KEPT) : raw })
  if (!checked.success) return NextResponse.json({ error: 'invalid' }, { status: 400 })

  const identity: ApiIdentity = { user, via: 'session', keyId: null, keyName: null, scope: null }
  const tools: ToolSet = Object.fromEntries([
    ...names.map((name) => [
      name,
      tool({
        description: TOOL_SPECS[name].description,
        inputSchema: jsonSchema<Record<string, unknown>>(inputSchemaFor(name, user) as Parameters<typeof jsonSchema>[0]),
        execute: async (input: Record<string, unknown>) => {
          try {
            return await runTool(name, input, identity)
          } catch (e) {
            // A refusal or a miss is the model's to read and explain, not a crash.
            if (e instanceof McpToolError) return { error: e.message }
            throw e
          }
        },
      }),
    ]),
    // No `execute`: these go to the browser, which opens the page or shows the question.
    ...CLIENT_TOOLS.map((name) => [
      name,
      tool({
        description: CLIENT_TOOL_SPECS[name].description,
        inputSchema: jsonSchema<Record<string, unknown>>(CLIENT_TOOL_SPECS[name].inputSchema as Parameters<typeof jsonSchema>[0]),
      }),
    ]),
  ])

  const locale = await getLocale()
  const tStatus = await getTranslations('status')
  const statusNames = PROJECT_STATUSES.map((s) => `${s} = ${tStatus(s as 'LEAD')}`).join(', ')
  const result = streamText({
    model,
    instructions: [
      MCP_SERVER_INFO.instructions,
      `Today is ${todayUtc().toISOString().slice(0, 10)}. You are talking to ${user.username} (role ${user.role}).`,
      pageContext(safeAppPath(page)),
      locale === 'en' ? 'Answer in English.' : 'Antworte auf Deutsch, kurz und in der Sprache eines Handwerksbetriebs (Sie-Form).',
      'Tools that change something are shown to the person as a proposal card they confirm or decline. Call such a tool directly with the complete input once you know it, and write no text before the call — no "Ich setze …", no "Ich führe das aus": the card shows the change and does the asking.',
      'Report only what tool results show. A change whose result says it was declined or denied was NOT carried out: say so plainly, and do not try it again unless asked. Never describe a change as done without its successful result.',
      'To show the person a page or record ("öffne", "zeig mir", "geh zu"), call open_page with its path; look the record up first and use its url. Opening needs no confirmation.',
      'When the person has to choose between a few records or answers, call ask_user with the question and the options instead of asking in text. Ask for free details (a name, an address) in text.',
      'Set only what the person asked for; leave other fields (a status when creating a project, for example) to their defaults unless asked.',
      'Never show internal ids (long codes like cmv…) to the person: name records by number and name. Never invent ids: look them up.',
      `Name statuses as the app does: ${statusNames}.`,
      locale === 'en'
        ? 'Write dates like 16 Nov 2026, never 2026-11-16.'
        : 'Schreiben Sie Daten immer als 16.11.2026, nie als 2026-11-16.',
      'Do not narrate what you are about to look up or do ("Ich suche …", "Ich zeige Ihnen …") — just call the tools; speak when you have an answer or a question.',
      'After a change has run, say in one short sentence, in the past tense, what was done. After opening a page, say nothing more than a few words. Keep answers short; use lists or a small table for several records.',
    ]
      .filter(Boolean)
      .join('\n'),
    messages: await convertToModelMessages(checked.data.slice(-HISTORY), { tools, ignoreIncompleteToolCalls: true }),
    tools,
    toolApproval: async ({ toolCall }) =>
      isWriteTool(toolCall.toolName)
        ? {
            type: 'user-approval',
            reason: JSON.stringify(await describeProposal(toolCall.toolName, (toolCall.input ?? {}) as Record<string, unknown>, identity)),
          }
        : undefined,
    experimental_toolApprovalSecret: approvalSecret(),
    stopWhen: isStepCount(10),
  })

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: checked.data,
      generateMessageId: messageId,
      // Kept as it stands now, cut off or not — the history shows what the person saw.
      onEnd: async ({ messages }) => {
        try {
          await saveChat(user.id, chatId, messages)
        } catch (e) {
          console.error('assistant chat not saved:', e instanceof Error ? e.message : e)
        }
      },
      // The failure is logged here (its message, never the request with the key);
      // the panel says it in the user's language.
      onError: (e) => {
        console.error('assistant failed:', e instanceof Error ? e.message : e)
        return 'assistantFailed'
      },
    }),
  })
}
