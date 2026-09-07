// The Model Context Protocol, the small part of it this app speaks.
//
// An AI assistant talks JSON-RPC to the app over HTTP: it introduces itself
// (initialize), asks what it may do (tools/list) and does it (tools/call).
// This file handles the wire format; it knows nothing about the database or
// the request — the tools and the caller's identity are handed in. That
// keeps it a plain function a test can drive without a server.

export const MCP_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const

export type JsonSchema = Record<string, unknown>

export type McpTool<Ctx> = {
  name: string
  description: string
  inputSchema: JsonSchema
  /** Runs the tool; whatever it returns is handed back as JSON text. */
  run: (args: Record<string, unknown>, ctx: Ctx) => Promise<unknown>
}

export type McpServerInfo = {
  name: string
  version: string
  /** What the assistant should know before using the tools. */
  instructions?: string
}

/**
 * A failure the assistant can do something about — a missing project, a
 * date in the wrong form. Reported as a tool result with isError, not as a
 * protocol error, so the assistant reads the message and tries again.
 */
export class McpToolError extends Error {}

type JsonRpcId = string | number | null

export type JsonRpcResponse = {
  jsonrpc: '2.0'
  id: JsonRpcId
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

const PARSE_ERROR = -32700
const INVALID_REQUEST = -32600
const METHOD_NOT_FOUND = -32601
const INVALID_PARAMS = -32602
const INTERNAL_ERROR = -32603

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const failure = (id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse => ({
  jsonrpc: '2.0',
  id,
  error: data === undefined ? { code, message } : { code, message, data },
})

const success = (id: JsonRpcId, result: unknown): JsonRpcResponse => ({ jsonrpc: '2.0', id, result })

/**
 * Handles one JSON-RPC message. A notification (no id) is acted on and
 * answered with null, since nothing goes back for it.
 */
export async function handleMcpMessage<Ctx>(
  message: unknown,
  tools: McpTool<Ctx>[],
  info: McpServerInfo,
  ctx: Ctx
): Promise<JsonRpcResponse | null> {
  if (!isRecord(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return failure(isRecord(message) && isId(message.id) ? message.id : null, INVALID_REQUEST, 'Invalid request')
  }
  const id = isId(message.id) ? message.id : null
  const isNotification = message.id === undefined
  const params = isRecord(message.params) ? message.params : {}

  if (isNotification) return null

  switch (message.method) {
    case 'initialize': {
      const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : ''
      const protocolVersion = (MCP_PROTOCOL_VERSIONS as readonly string[]).includes(asked)
        ? asked
        : MCP_PROTOCOL_VERSIONS[0]
      return success(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: info.name, version: info.version },
        ...(info.instructions ? { instructions: info.instructions } : {}),
      })
    }
    case 'ping':
      return success(id, {})
    case 'tools/list':
      return success(id, {
        tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      })
    case 'tools/call': {
      const name = typeof params.name === 'string' ? params.name : ''
      const tool = tools.find((t) => t.name === name)
      if (!tool) return failure(id, INVALID_PARAMS, `Unknown tool: ${name || '(none)'}`)
      const args = isRecord(params.arguments) ? params.arguments : {}
      try {
        const result = await tool.run(args, ctx)
        const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
        return success(id, { content: [{ type: 'text', text }], isError: false })
      } catch (e) {
        if (e instanceof McpToolError) {
          return success(id, { content: [{ type: 'text', text: e.message }], isError: true })
        }
        return failure(id, INTERNAL_ERROR, 'The tool failed', e instanceof Error ? e.message : undefined)
      }
    }
    default:
      return failure(id, METHOD_NOT_FOUND, `Method not found: ${message.method}`)
  }
}

const isId = (v: unknown): v is JsonRpcId => typeof v === 'string' || typeof v === 'number' || v === null

export type McpHttpResult = { status: number; body: JsonRpcResponse | JsonRpcResponse[] | null }

/**
 * Handles the body of one HTTP POST: a message or a batch of them. Only
 * notifications in it means there is nothing to say back (202); a body that
 * is not JSON-RPC at all is refused (400).
 */
export async function handleMcpBody<Ctx>(
  body: unknown,
  tools: McpTool<Ctx>[],
  info: McpServerInfo,
  ctx: Ctx
): Promise<McpHttpResult> {
  if (Array.isArray(body)) {
    if (body.length === 0) return { status: 400, body: failure(null, INVALID_REQUEST, 'Empty batch') }
    const answers = (await Promise.all(body.map((m) => handleMcpMessage(m, tools, info, ctx)))).filter(
      (r): r is JsonRpcResponse => r !== null
    )
    return answers.length ? { status: 200, body: answers } : { status: 202, body: null }
  }
  const answer = await handleMcpMessage(body, tools, info, ctx)
  if (answer === null) return { status: 202, body: null }
  return { status: answer.error?.code === INVALID_REQUEST ? 400 : 200, body: answer }
}

/** The answer to a body that was not even JSON. */
export const parseErrorResponse = (): McpHttpResult => ({
  status: 400,
  body: failure(null, PARSE_ERROR, 'Parse error'),
})
