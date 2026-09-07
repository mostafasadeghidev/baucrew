import { NextResponse } from 'next/server'
import { authenticateApi } from '@/lib/api-auth'
import { unauthorized } from '@/lib/api-http'
import { handleMcpBody, parseErrorResponse } from '@/lib/mcp'
import { MCP_SERVER_INFO, mcpTools } from '@/lib/mcp-tools'

// The MCP endpoint: an AI assistant's door into the app, over plain HTTP
// (the "Streamable HTTP" transport, without a server-side stream — every
// answer is one JSON document). Authenticated with an API key like the
// rest of the API; the assistant acts as that key's user.

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const identity = await authenticateApi(req)
  if (!identity) return unauthorized()
  if (identity.user.role === 'EMPLOYEE') {
    return NextResponse.json({ error: 'forbidden', message: 'This key belongs to a crew account; MCP is for the office.' }, { status: 403 })
  }
  let body: unknown
  try {
    body = await req.json()
  } catch {
    const { status, body: answer } = parseErrorResponse()
    return NextResponse.json(answer, { status })
  }
  const { status, body: answer } = await handleMcpBody(body, mcpTools, MCP_SERVER_INFO, identity)
  if (answer === null) return new NextResponse(null, { status })
  return NextResponse.json(answer, { status })
}

/** No server-initiated messages: nothing to stream. */
export function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } })
}

/** Nothing to end: every request stands on its own. */
export function DELETE() {
  return new NextResponse(null, { status: 204 })
}
