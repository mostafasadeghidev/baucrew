import { describe, expect, it } from 'vitest'
import {
  MAX_ATTEMPTS,
  envelope,
  isWebhookEvent,
  isWebhookUrl,
  normalizeSystem,
  projectChanges,
  retryDelay,
  signBody,
  statusSinceOf,
  trelloShortLink,
  type ProjectSnapshot,
} from '@/lib/webhook-events'
import { mimeFromName } from '@/lib/files'

describe('signBody', () => {
  it('is HMAC-SHA256 of the body with the secret, hex, with the algorithm in front', () => {
    // The published HMAC-SHA256 test vector.
    expect(signBody('key', 'The quick brown fox jumps over the lazy dog')).toBe(
      'sha256=f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8'
    )
  })

  it('changes with a single character of the body', () => {
    expect(signBody('whsec_x', '{"a":1}')).not.toBe(signBody('whsec_x', '{"a":2}'))
  })
})

describe('envelope', () => {
  it('carries the id, the event, the time and the data', () => {
    expect(envelope('e1', 'project.created', new Date('2026-09-14T08:00:00Z'), { x: 1 })).toEqual({
      id: 'e1',
      event: 'project.created',
      occurredAt: '2026-09-14T08:00:00.000Z',
      data: { x: 1 },
    })
  })
})

describe('retryDelay', () => {
  it('waits longer after each failure and gives up after the last attempt', () => {
    const waits = Array.from({ length: MAX_ATTEMPTS - 1 }, (_, i) => retryDelay(i + 1)!)
    expect(waits).toEqual([60_000, 300_000, 1_800_000, 7_200_000, 21_600_000, 86_400_000])
    expect(retryDelay(MAX_ATTEMPTS)).toBeNull()
  })
})

describe('what an endpoint may be', () => {
  it('knows its events', () => {
    expect(isWebhookEvent('project.status_changed')).toBe(true)
    expect(isWebhookEvent('project.exploded')).toBe(false)
  })

  it('takes http and https addresses only', () => {
    expect(isWebhookUrl('https://n8n.example/webhook/abc')).toBe(true)
    expect(isWebhookUrl('http://localhost:5678/webhook/abc')).toBe(true)
    expect(isWebhookUrl('ftp://n8n.example/x')).toBe(false)
    expect(isWebhookUrl('n8n.example/webhook')).toBe(false)
  })

  it('keeps system names lower case and plain', () => {
    expect(normalizeSystem(' Trello ')).toBe('trello')
    expect(normalizeSystem('wattro')).toBe('wattro')
    expect(normalizeSystem('trello/../x')).toBeNull()
    expect(normalizeSystem('')).toBeNull()
  })

  it('reads the short link of a Trello card address', () => {
    expect(trelloShortLink('https://trello.com/c/AbC123xy/12-musterhaus')).toBe('AbC123xy')
    expect(trelloShortLink('https://trello.com/c/AbC123xy')).toBe('AbC123xy')
    expect(trelloShortLink('https://example.com/c/AbC123xy')).toBeNull()
    expect(trelloShortLink(null)).toBeNull()
  })
})

describe('projectChanges', () => {
  const base: ProjectSnapshot = {
    id: 'p1',
    status: 'LEAD',
    name: 'Musterhaus Fassade',
    customerId: 'c1',
    managerId: null,
    plannedStart: null,
    plannedEnd: null,
    actualStart: null,
    actualEnd: null,
    price: null,
    orderValue: null,
    isSub: false,
    street: null,
    postalCode: null,
    city: 'Musterstadt',
    description: null,
  }

  it('tells a new status apart from the other changes', () => {
    const after = { ...base, status: 'QUOTED', price: 12_500, orderValue: 12_500, plannedStart: '2026-10-05' }
    expect(projectChanges(base, after)).toEqual({
      status: { from: 'LEAD', to: 'QUOTED' },
      fields: {
        plannedStart: { from: null, to: '2026-10-05' },
        price: { from: null, to: 12_500 },
        orderValue: { from: null, to: 12_500 },
      },
    })
  })

  it('finds nothing when nothing changed', () => {
    expect(projectChanges(base, { ...base })).toEqual({ status: null, fields: {} })
  })
})

describe('statusSinceOf', () => {
  const created = new Date('2026-09-01T10:00:00Z')
  const onBoard = new Date('2026-08-20T09:00:00Z')
  const changed = new Date('2026-09-10T12:00:00Z')

  it('is the last status change, else the day on the board it came from, else the day it was made', () => {
    expect(statusSinceOf(changed, onBoard, created)).toBe(changed)
    expect(statusSinceOf(null, onBoard, created)).toBe(onBoard)
    expect(statusSinceOf(null, null, created)).toBe(created)
  })
})

describe('mimeFromName', () => {
  it('gives an accepted type by the file name, and nothing for one that is not accepted', () => {
    expect(mimeFromName('Angebot.PDF')).toBe('application/pdf')
    expect(mimeFromName('foto.jpeg')).toBe('image/jpeg')
    expect(mimeFromName('programm.exe')).toBeNull()
    expect(mimeFromName('ohne-endung')).toBeNull()
  })
})
