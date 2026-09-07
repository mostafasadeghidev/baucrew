import 'server-only'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { ApiError } from './api-service'
import { authenticateApi, type ApiIdentity } from './api-auth'

/** The 401 that also tells a client how to authenticate. */
export function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: 'unauthorized', message: 'Send an API key as "Authorization: Bearer <key>".' },
    { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="BauCrew"' } }
  )
}

/**
 * Runs an API handler as the authenticated caller and turns what it throws
 * into the answer it means: a refusal, a miss, a bad input, or a failure.
 */
export async function withApi(
  req: Request,
  handler: (identity: ApiIdentity) => Promise<unknown>
): Promise<NextResponse> {
  const identity = await authenticateApi(req)
  if (!identity) return unauthorized()
  try {
    const result = await handler(identity)
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof ApiError) return NextResponse.json({ error: e.code, message: e.message }, { status: e.status })
    if (e instanceof ZodError) {
      return NextResponse.json(
        { error: 'invalid', message: 'The input is not valid.', issues: e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
        { status: 400 }
      )
    }
    console.error('api', e)
    return NextResponse.json({ error: 'failed', message: 'Something went wrong.' }, { status: 500 })
  }
}

/** The JSON body of a request, or an empty object when there is none. */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const raw = await req.text()
  if (!raw.trim()) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    throw new ApiError(400, 'badJson', 'The body is not JSON.')
  }
}

/** Query-string parameters as a plain object (repeated keys keep the first). */
export const query = (req: Request): Record<string, string> =>
  Object.fromEntries(new URL(req.url).searchParams.entries())
