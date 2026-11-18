import { generateText, Output } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'
import { cleanQuoteFacts, type QuoteFacts } from './quotes'

/**
 * A scanned quote — a PDF of pictures, no words — read by OpenAI, with the
 * same key as the assistant and the voice notes. OFF unless QUOTE_OCR=1:
 * it sends the client's document, prices and the customer's name and
 * address included, to OpenAI. Files with words never leave the server.
 * What comes back passes the same checks as a text reading
 * (cleanQuoteFacts): totals only when they add up.
 */

/** The model when QUOTE_OCR_MODEL does not name one. */
const DEFAULT_OCR_MODEL = 'gpt-5-mini'

const env = (name: string) => process.env[name]?.trim() || undefined

/** Whether scans are sent to OpenAI at all: switched on, and a key set. */
export function quoteOcrEnabled(): boolean {
  return env('QUOTE_OCR') === '1' && Boolean(env('OPENAI_API_KEY'))
}

const answer = z.object({
  isQuote: z.boolean().describe('true only if this document is a quote/offer (Angebot) for building work'),
  docType: z.string().nullable().describe('what the document calls itself, e.g. "Angebot", "Nachtragsangebot", "Rechnung"'),
  quoteNumber: z.string().nullable().describe("the quote's own number"),
  jobNumber: z.string().nullable().describe('the number labelled "Baustellennr." or "Vorgang-Nr." / "Vorgangsnummer", digits only'),
  quoteDate: z.string().nullable().describe('the date of the quote as YYYY-MM-DD'),
  net: z.number().nullable().describe('total net amount in EUR (Netto)'),
  vat: z.number().nullable().describe('total VAT amount in EUR (MwSt / Steuer)'),
  vatRate: z.number().nullable().describe('VAT rate in percent, e.g. 19'),
  gross: z.number().nullable().describe('total gross amount in EUR (Brutto)'),
})

/** The reader the backfill and the upload hand to readDocumentQuote, or null while it is off. */
export function quoteOcr(): ((data: Uint8Array) => Promise<QuoteFacts | null>) | null {
  if (!quoteOcrEnabled()) return null
  const openai = createOpenAI({ apiKey: env('OPENAI_API_KEY'), baseURL: env('OPENAI_BASE_URL') })
  const model = openai(env('QUOTE_OCR_MODEL') ?? DEFAULT_OCR_MODEL)
  return async (data) => {
    const { output } = await generateText({
      model,
      output: Output.object({ schema: answer }),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'This is a scanned German business document. Say whether it is a quote (Angebot) and read its totals and numbers exactly as printed. Use null for anything that is not printed.',
            },
            { type: 'file', mediaType: 'application/pdf', data },
          ],
        },
      ],
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(120_000),
    })
    return cleanQuoteFacts(output)
  }
}
