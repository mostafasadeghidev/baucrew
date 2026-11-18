import { afterEach, describe, expect, it } from 'vitest'
import { MockTranscriptionModelV4 } from 'ai/test'
import { transcribeRecording, transcriptionConfigured, transcriptionModel } from '@/lib/transcription'

// The voice note's words, with a stand-in for OpenAI: what is sent, what comes back.

type Call = Parameters<MockTranscriptionModelV4['doGenerate']>[0]

function stub(text: string, calls: Call[] = []) {
  return new MockTranscriptionModelV4({
    doGenerate: async (options) => {
      calls.push(options)
      return {
        text,
        segments: [],
        language: undefined,
        durationInSeconds: undefined,
        warnings: [],
        response: { timestamp: new Date(), modelId: 'stub' },
      }
    },
  })
}

const saved = { ...process.env }
afterEach(() => {
  process.env = { ...saved }
})

describe('transcribeRecording', () => {
  it('sends the recording in German by default and returns the trimmed words', async () => {
    delete process.env.OPENAI_TRANSCRIBE_LANGUAGE
    const calls: Call[] = []
    const audio = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3])
    const text = await transcribeRecording(audio, stub('  Gerüst im Hof steht, Fassade Nord grundiert.  ', calls))
    expect(text).toBe('Gerüst im Hof steht, Fassade Nord grundiert.')
    expect(calls).toHaveLength(1)
    expect(calls[0].providerOptions).toEqual({ openai: { language: 'de' } })
    expect(Array.from(calls[0].audio as Uint8Array)).toEqual(Array.from(audio))
  })

  it('asks for the configured language', async () => {
    process.env.OPENAI_TRANSCRIBE_LANGUAGE = 'en'
    const calls: Call[] = []
    await transcribeRecording(new Uint8Array([1, 2, 3]), stub('ok', calls))
    expect(calls[0].providerOptions).toEqual({ openai: { language: 'en' } })
  })

  it('passes a failure on, so the caller can keep the recording and mark it', async () => {
    const failing = new MockTranscriptionModelV4({
      doGenerate: async () => {
        throw new Error('503')
      },
    })
    await expect(transcribeRecording(new Uint8Array([1]), failing)).rejects.toThrow()
  })
})

describe('transcription setup', () => {
  it('is off without a key and builds no model', () => {
    process.env.OPENAI_API_KEY = ''
    expect(transcriptionConfigured()).toBe(false)
    expect(transcriptionModel()).toBeNull()
  })

  it('builds the configured model with a key', () => {
    process.env.OPENAI_API_KEY = 'sk-test-not-real'
    process.env.OPENAI_TRANSCRIBE_MODEL = 'whisper-1'
    expect(transcriptionConfigured()).toBe(true)
    const model = transcriptionModel()
    expect(model).not.toBeNull()
    expect(typeof model === 'object' && model !== null && 'modelId' in model ? model.modelId : model).toBe('whisper-1')
  })
})
