import 'server-only'
import { createHmac, randomBytes } from 'crypto'
import { createOpenAI } from '@ai-sdk/openai'

// The in-app assistant's settings, all from the server's environment: the
// OpenAI key (never sent to the browser, never logged), the model, and an
// optional other address for an OpenAI-compatible endpoint. Without a key
// the panel says it is not set up and nothing else happens.

/** The model when OPENAI_MODEL does not name one. */
export const DEFAULT_ASSISTANT_MODEL = 'gpt-5-mini'

const env = (name: string) => process.env[name]?.trim() || undefined

/** Whether the assistant can run at all — what the panel needs to know, and all it is told. */
export function assistantConfigured(): boolean {
  return Boolean(env('OPENAI_API_KEY'))
}

/** The language model the assistant talks to, or null when no key is set. */
export function assistantModel() {
  const apiKey = env('OPENAI_API_KEY')
  if (!apiKey) return null
  const openai = createOpenAI({ apiKey, baseURL: env('OPENAI_BASE_URL') })
  return openai.chat(env('OPENAI_MODEL') ?? DEFAULT_ASSISTANT_MODEL)
}

// Made once per process when nothing is configured: a confirmation then holds
// until the server restarts, which is all a running conversation needs.
const fallbackSecret = randomBytes(32)

/**
 * The key a confirmation is signed with, so the browser cannot make up a "yes"
 * the person never gave: the server signs every proposal it shows and runs a
 * change only with its own signature back.
 */
export function approvalSecret(): Uint8Array {
  const configured = env('ASSISTANT_APPROVAL_SECRET') ?? env('SESSION_SECRET')
  return configured ? createHmac('sha256', configured).update('baucrew-assistant-approval').digest() : fallbackSecret
}
