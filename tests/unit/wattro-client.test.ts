import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchAssetPage, fetchEmployees, fetchProjects, retryAfterMs, WATTRO_DEFAULT_BASE_URL, WattroApiError } from '@/lib/wattro/client'

// The client reads the key from the environment on every call, so a test
// key set here stays inside this process and never leaves it.
const TEST_KEY = 'test-key-not-a-secret'

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return {
    ok: (init.status ?? 200) >= 200 && (init.status ?? 200) < 300,
    status: init.status ?? 200,
    headers: new Headers(init.headers),
    json: async () => body,
  }
}

function assetPayload(id: number, over: Record<string, unknown> = {}) {
  return {
    id,
    name: `Muster Gerät ${id}`,
    human_id: `G-${id}`,
    storage_location: 'Halle Regal 3',
    active: true,
    updated_at: '2026-09-29T10:00:00Z',
    current_assignment: null,
    // Everything else Wattro sends (price, gps, tags …) is present but unread.
    price: '12.34',
    tags: [],
    ...over,
  }
}

const fetchMock = vi.fn()

beforeEach(() => {
  process.env.WATTRO_API_KEY = TEST_KEY
  delete process.env.WATTRO_BASE_URL
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  delete process.env.WATTRO_API_KEY
})

describe('fetchAssetPage', () => {
  it('asks for one page with bearer auth, explicit page size and the active filter', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [assetPayload(1)], count: 1 }))

    const page = await fetchAssetPage({ active: true, offset: 0 })

    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toMatchObject({ id: 1, humanId: 'G-1', storageLocation: 'Halle Regal 3' })
    expect(page.invalid).toBe(0)
    expect(page.count).toBe(1)

    const [url, init] = fetchMock.mock.calls[0]
    expect(init.headers.Authorization).toBe(`Bearer ${TEST_KEY}`)
    expect(url.searchParams.get('active')).toBe('true')
    expect(url.searchParams.get('limit')).toBe('100')
    expect(url.searchParams.get('offset')).toBe('0')
  })

  it('keeps the readable assignment reference and maps an inactive ask', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        items: [assetPayload(2, { active: false, current_assignment: { assignee_id: 7, assignee_type: 'employee' } })],
        count: 1,
      })
    )

    const page = await fetchAssetPage({ active: false, offset: 0 })
    expect(page.items[0]).toMatchObject({
      active: false,
      currentAssignment: { assigneeId: 7, assigneeType: 'employee' },
    })
  })

  it('counts an incomplete record instead of failing the page', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ items: [assetPayload(1), { id: 9, name: 'Kaputt' }, null], count: 3 })
    )

    const page = await fetchAssetPage({ active: true, offset: 0 })
    expect(page.items).toHaveLength(1)
    expect(page.invalid).toBe(2)
  })

  it('reads left-out optional fields as none, and a left-out active as Wattro’s default', async () => {
    const bare = { id: 5, name: ' Muster Säge ', updated_at: '2026-09-29T10:00:00Z', tags: [] }
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [bare], count: 1 }))

    const page = await fetchAssetPage({ active: true, offset: 0 })
    expect(page.invalid).toBe(0)
    expect(page.items[0]).toMatchObject({
      id: 5,
      humanId: null,
      storageLocation: null,
      active: true,
      currentAssignment: null,
    })
  })

  it('reads the rest of the record too — names inline, tags as names, decimals kept as sent', async () => {
    const full = assetPayload(8, {
      brand: 'Musterwerk',
      model: 'MX 300',
      serial_number: 'SN-1',
      price: '499.00',
      purchased_at: '2024-01-09',
      tags: [{ id: 1, name: 'Akku' }, { id: 2, name: 'Schleifen' }],
      home_employee: { id: 7, name: 'Max Muster', email: 'max@example.com' },
      home_store: { id: 1, name: 'Muster Lager' },
      last_assign_ts: '2026-09-20T07:00:00Z',
      last_seen_ts: '2026-09-28T15:30:00Z',
      last_seen_trigger: 'SCAN_EPC',
      last_seen_by_terminal: 3,
      last_position_latitude: '49.5',
      last_position_longitude: '11.25',
      gps_mode: 'ENABLED',
    })
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [full], count: 1 }))

    const [asset] = (await fetchAssetPage({ active: true, offset: 0 })).items
    expect(asset.extra).toMatchObject({
      brand: 'Musterwerk',
      price: '499.00',
      tags: ['Akku', 'Schleifen'],
      homeEmployee: { id: 7, name: 'Max Muster' },
      homeStore: { id: 1, name: 'Muster Lager' },
      lastSeenTrigger: 'SCAN_EPC',
      lastSeenByTerminalId: 3,
      latitude: '49.5',
      gpsMode: 'ENABLED',
    })
    // Only id and name of a person are kept — never the e-mail.
    expect(JSON.stringify(asset)).not.toContain('max@example.com')
  })

  it('reads a shown-only field of an odd shape as none, without throwing the machine away', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ items: [assetPayload(9, { brand: 42, tags: 'Akku', home_store: { id: 'x' } })], count: 1 })
    )

    const page = await fetchAssetPage({ active: true, offset: 0 })
    expect(page.invalid).toBe(0)
    expect(page.items[0].extra).toMatchObject({ brand: null, tags: [], homeStore: null })
  })

  it('rejects with a response error when the envelope is not items+count', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [], total: 0 }))

    await expect(fetchAssetPage({ active: true, offset: 0 })).rejects.toMatchObject({ kind: 'response' })
  })

  it('rejects with a response error on non-JSON', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => {
        throw new Error('not json')
      },
    })
    await expect(fetchAssetPage({ active: true, offset: 0 })).rejects.toBeInstanceOf(WattroApiError)
  })

  it('treats a rejected key as final — no retry, auth error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Unauthorized' }, { status: 401 }))

    await expect(fetchAssetPage({ active: true, offset: 0 })).rejects.toMatchObject({ kind: 'auth', status: 401 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('treats 403 like a rejected key', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Forbidden' }, { status: 403 }))
    await expect(fetchAssetPage({ active: true, offset: 0 })).rejects.toMatchObject({ kind: 'auth' })
  })

  it('does not retry other client errors — 404 is an upstream error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Not found' }, { status: 404 }))
    await expect(fetchAssetPage({ active: true, offset: 0 })).rejects.toMatchObject({ kind: 'upstream', status: 404 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries 5xx and gives up after the second retry', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'Boom' }, { status: 503 }))

    vi.useFakeTimers()
    // The handler goes on before the timers run, so the final rejection is
    // awaited the moment it happens rather than drifting unhandled.
    const run = expect(fetchAssetPage({ active: true, offset: 0 })).rejects.toMatchObject({
      kind: 'upstream',
      status: 503,
    })
    await vi.runAllTimersAsync()
    await run
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('retries a 429, honours a short Retry-After, and succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: 'Slow down' }, { status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(jsonResponse({ items: [assetPayload(1)], count: 1 }))

    await expect(fetchAssetPage({ active: true, offset: 0 })).resolves.toMatchObject({ count: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('waits its own backoff when a 429 or 5xx carries no Retry-After', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: 'Boom' }, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ items: [], count: 0 }))

    vi.useFakeTimers()
    const run = fetchAssetPage({ active: true, offset: 0 })
    await vi.advanceTimersByTimeAsync(499)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await expect(run).resolves.toMatchObject({ count: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up at once when Wattro asks for a longer wait than a click can hold', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Slow down' }, { status: 429, headers: { 'retry-after': '120' } }))

    await expect(fetchAssetPage({ active: true, offset: 0 })).rejects.toMatchObject({ kind: 'rateLimit', status: 429 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reads Retry-After seconds, and nothing from a missing or odd header', () => {
    const res = (headers: Record<string, string>) => ({ headers: new Headers(headers) }) as Response
    expect(retryAfterMs(res({}))).toBeNull()
    expect(retryAfterMs(res({ 'retry-after': '' }))).toBeNull()
    expect(retryAfterMs(res({ 'retry-after': 'Wed, 30 Sep 2026 10:00:00 GMT' }))).toBeNull()
    expect(retryAfterMs(res({ 'retry-after': '3' }))).toBe(3000)
    expect(retryAfterMs(res({ 'retry-after': '0' }))).toBe(0)
  })

  it('retries a network failure and succeeds on the second call', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET')).mockResolvedValueOnce(
      jsonResponse({ items: [], count: 0 })
    )

    vi.useFakeTimers()
    const run = fetchAssetPage({ active: true, offset: 0 })
    await vi.runAllTimersAsync()
    await expect(run).resolves.toMatchObject({ items: [], count: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up as a network error when every call fails to connect', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))

    vi.useFakeTimers()
    const run = expect(fetchAssetPage({ active: true, offset: 0 })).rejects.toMatchObject({ kind: 'network' })
    await vi.runAllTimersAsync()
    await run
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('falls back to the development host outside production', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [], count: 0 }))
    await fetchAssetPage({ active: true, offset: 0 })
    const [url] = fetchMock.mock.calls[0]
    expect(url.toString()).toBe(`${WATTRO_DEFAULT_BASE_URL}/asset/?active=true&limit=100&offset=0`)
  })

  it('uses the configured base URL and never puts the key in the URL', async () => {
    process.env.WATTRO_BASE_URL = 'https://wattro.example.test/api/v0'
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [], count: 0 }))

    await fetchAssetPage({ active: true, offset: 0 })

    const [url] = fetchMock.mock.calls[0]
    expect(url.toString()).toBe('https://wattro.example.test/api/v0/asset/?active=true&limit=100&offset=0')
    expect(url.toString()).not.toContain(TEST_KEY)
  })
})

describe('wattroConfig in production', () => {
  // A fresh module per test: the "warn once" flag lives in module state.
  async function freshClient() {
    vi.resetModules()
    return import('@/lib/wattro/client')
  }

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
    process.env.WATTRO_API_KEY = TEST_KEY
    delete process.env.WATTRO_BASE_URL
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('treats a key without WATTRO_BASE_URL as not configured and warns once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const client = await freshClient()

    expect(client.wattroConfig().apiKey).toBeNull()
    expect(client.isWattroConfigured()).toBe(false)
    expect(client.wattroConfig().apiKey).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).not.toContain(TEST_KEY)

    await expect(client.fetchAssetPage({ active: true, offset: 0 })).rejects.toMatchObject({ kind: 'auth' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stays quiet when neither key nor URL is set', async () => {
    delete process.env.WATTRO_API_KEY
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const client = await freshClient()

    expect(client.isWattroConfigured()).toBe(false)
    expect(warn).not.toHaveBeenCalled()
  })

  it('is configured as soon as an explicit base URL comes with the key', async () => {
    process.env.WATTRO_BASE_URL = 'https://wattro.example.test/api/v1/'
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const client = await freshClient()

    expect(client.wattroConfig()).toEqual({ baseUrl: 'https://wattro.example.test/api/v1', apiKey: TEST_KEY })
    expect(client.isWattroConfigured()).toBe(true)
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('fetchEmployees / fetchProjects', () => {
  it('reads people as id → name, nothing else', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        { id: 7, name: ' Max Muster ', email: 'max@example.com', phone: '0123', nfc: 'ab' },
        { id: 'broken' },
      ])
    )
    const employees = await fetchEmployees()
    expect([...employees]).toEqual([[7, 'Max Muster']])
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api-dev.wattro.io/api/v1/employee/')
  })

  it('reads projects, finished ones included, with number and address', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        { id: 70, name: 'Musterstraße 1', human_id: 'P70', address: 'Musterstadt', finished: false, phone: '0123' },
        { id: 71, name: 'Altbau', human_id: null, finished: true },
      ])
    )
    const projects = await fetchProjects()
    expect(projects.get(70)).toEqual({ name: 'Musterstraße 1', projectNo: 'P70', address: 'Musterstadt', finished: false })
    expect(projects.get(71)).toEqual({ name: 'Altbau', projectNo: null, address: null, finished: true })
  })

  it('stops the run when a list is not a list', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [] }))
    await expect(fetchEmployees()).rejects.toMatchObject({ kind: 'response' })
  })

  it('treats a rejected key on a list like on the assets', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Unauthorized' }, { status: 401 }))
    await expect(fetchProjects()).rejects.toMatchObject({ kind: 'auth' })
  })
})
