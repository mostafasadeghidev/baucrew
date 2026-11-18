import 'server-only'
import { transcribe } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { transcriptionSettings } from './documentation'

// A voice note written out by OpenAI — the same key as the in-app assistant
// (see assistant.ts), never sent to the browser, never logged. The recording
// leaves the server for this and nothing else; the UI says so where a note is
// recorded. Without a key nothing is sent and the note keeps its sound alone.

type Model = Parameters<typeof transcribe>[0]['model']

/** Whether a voice note can be written out at all. */
export function transcriptionConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim())
}

/** The transcription model, or null when no key is set. */
export function transcriptionModel(): Model | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null
  const openai = createOpenAI({ apiKey, baseURL: process.env.OPENAI_BASE_URL?.trim() || undefined })
  return openai.transcription(transcriptionSettings(process.env).model)
}

/**
 * The words of one recording, in the configured language (German unless
 * OPENAI_TRANSCRIBE_LANGUAGE says otherwise). Throws when the service fails;
 * the caller keeps the recording and marks the transcript as failed.
 */
export async function transcribeRecording(audio: Uint8Array, model: Model): Promise<string> {
  const { language } = transcriptionSettings(process.env)
  const result = await transcribe({
    model,
    audio,
    providerOptions: { openai: { language } },
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(120_000),
  })
  return result.text.trim()
}
