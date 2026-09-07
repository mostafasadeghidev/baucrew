import { describe, expect, it } from 'vitest'
import { handleMcpBody, handleMcpMessage, McpToolError, type McpTool } from '@/lib/mcp'

type Ctx = { user: string }

const tools: McpTool<Ctx>[] = [
  {
    name: 'greet',
    description: 'Says hello',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
    run: async (args, ctx) => ({ hello: args.name, from: ctx.user }),
  },
  {
    name: 'fail',
    description: 'Always fails the way a tool may',
    inputSchema: { type: 'object', properties: {} },
    run: async () => {
      throw new McpToolError('No such project')
    },
  },
  {
    name: 'crash',
    description: 'Breaks',
    inputSchema: { type: 'object', properties: {} },
    run: async () => {
      throw new Error('boom')
    },
  },
]
const info = { name: 'BauCrew', version: '1.0.0', instructions: 'Dates are YYYY-MM-DD.' }
const ctx: Ctx = { user: 'office' }
const call = (message: unknown) => handleMcpMessage(message, tools, info, ctx)

describe('the MCP wire', () => {
  it('introduces itself and settles on a protocol version it speaks', async () => {
    const r = await call({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } })
    expect(r?.result).toMatchObject({
      protocolVersion: '2025-03-26',
      serverInfo: { name: 'BauCrew' },
      instructions: 'Dates are YYYY-MM-DD.',
    })
    const unknown = await call({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } })
    expect((unknown?.result as { protocolVersion: string }).protocolVersion).toBe('2025-06-18')
  })

  it('lists the tools with their schemas', async () => {
    const r = await call({ jsonrpc: '2.0', id: 3, method: 'tools/list' })
    expect((r?.result as { tools: Array<{ name: string }> }).tools.map((t) => t.name)).toEqual(['greet', 'fail', 'crash'])
  })

  it('runs a tool and hands back its result as text', async () => {
    const r = await call({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'greet', arguments: { name: 'Anna' } } })
    expect(r?.result).toEqual({ content: [{ type: 'text', text: JSON.stringify({ hello: 'Anna', from: 'office' }, null, 2) }], isError: false })
  })

  it("reports a tool's own failure as a result the assistant can read", async () => {
    const r = await call({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'fail' } })
    expect(r?.result).toEqual({ content: [{ type: 'text', text: 'No such project' }], isError: true })
  })

  it('reports a crash as an internal error without the stack', async () => {
    const r = await call({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'crash' } })
    expect(r?.error).toEqual({ code: -32603, message: 'The tool failed', data: 'boom' })
  })

  it('refuses an unknown tool and an unknown method', async () => {
    const tool = await call({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'nope' } })
    expect(tool?.error?.code).toBe(-32602)
    const method = await call({ jsonrpc: '2.0', id: 8, method: 'resources/list' })
    expect(method?.error?.code).toBe(-32601)
  })

  it('answers a notification with nothing and a ping with an empty result', async () => {
    expect(await call({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull()
    expect((await call({ jsonrpc: '2.0', id: 9, method: 'ping' }))?.result).toEqual({})
  })

  it('refuses what is not a request at all', async () => {
    const r = await call({ hello: 'world' })
    expect(r?.error?.code).toBe(-32600)
  })
})

describe('one HTTP body', () => {
  it('answers a batch with the answers that exist', async () => {
    const r = await handleMcpBody(
      [
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 1, method: 'ping' },
      ],
      tools,
      info,
      ctx
    )
    expect(r.status).toBe(200)
    expect(r.body).toEqual([{ jsonrpc: '2.0', id: 1, result: {} }])
  })

  it('answers notifications alone with 202 and nothing', async () => {
    const r = await handleMcpBody({ jsonrpc: '2.0', method: 'notifications/initialized' }, tools, info, ctx)
    expect(r).toEqual({ status: 202, body: null })
  })

  it('answers a body that is not a request with 400', async () => {
    const r = await handleMcpBody({ nonsense: true }, tools, info, ctx)
    expect(r.status).toBe(400)
  })
})
