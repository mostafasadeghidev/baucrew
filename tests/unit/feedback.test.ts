import { describe, expect, it } from 'vitest'
import {
  activeFilterCount,
  canEditFeedback,
  canSeeFeedback,
  cleanAnchor,
  cleanFilters,
  cleanMetadata,
  cleanPage,
  DEFAULT_FILTERS,
  evidenceFor,
  evidenceMatches,
  feedbackHandoff,
  feedbackVisibleWhere,
  groupByStatus,
  hasChange,
  hasProposal,
  latestDecision,
  pageLink,
  pinsWhere,
  queryFeedback,
  sniffImageType,
  titleFrom,
  toggledStatus,
  validateEdit,
  validateImage,
  validateNewFeedback,
  validateNote,
  withCommentParam,
  withoutCommentParam,
  wordDiff,
  type FeedbackItemDTO,
} from '@/lib/feedback'

function item(over: Partial<FeedbackItemDTO> = {}): FeedbackItemDTO {
  return {
    id: 'i1',
    number: 64,
    title: 'Knopf zu klein',
    comment: 'Der Knopf „Speichern“ ist auf dem Handy zu klein.',
    status: 'INBOX',
    source: 'comment',
    waitingOn: null,
    officeOnly: false,
    page: '/my',
    anchor: { selector: 'main > button:nth-of-type(1)', text: 'Speichern', x: 0.5, y: 0.5 },
    metadata: { browser: 'Safari 18', os: 'iOS' },
    context: null,
    suggestion: '',
    decision: '',
    beforeText: '',
    afterText: '',
    completionNote: '',
    version: 1,
    author: { id: 'u1', name: 'Muster Maler' },
    createdAt: '2026-10-30T10:00:00.000Z',
    updatedAt: '2026-10-30T10:00:00.000Z',
    attachments: [],
    notes: [],
    changes: [],
    ...over,
  }
}

describe('who may do what', () => {
  it('lets the office edit, and nobody else', () => {
    expect(canEditFeedback({ role: 'ADMIN' })).toBe(true)
    expect(canEditFeedback({ role: 'MANAGER' })).toBe(true)
    expect(canEditFeedback({ role: 'SITE_MANAGER' })).toBe(false)
    expect(canEditFeedback({ role: 'EMPLOYEE' })).toBe(false)
  })

  it('keeps what the office wrote from the crew, but never a person from their own item', () => {
    const crew = { id: 'u2', role: 'EMPLOYEE' }
    expect(canSeeFeedback(crew, { officeOnly: true, authorId: 'u9' })).toBe(false)
    expect(canSeeFeedback(crew, { officeOnly: false, authorId: 'u9' })).toBe(true)
    expect(canSeeFeedback(crew, { officeOnly: true, authorId: 'u2' })).toBe(true)
    expect(canSeeFeedback({ id: 'a', role: 'ADMIN' }, { officeOnly: true, authorId: 'u9' })).toBe(true)
  })

  it('keeps the visibility rule when the pins add their page filter', () => {
    const crew = pinsWhere({ id: 'u2', role: 'EMPLOYEE' }, '/my')
    expect(crew.AND[0]).toEqual({ OR: [{ officeOnly: false }, { authorId: 'u2' }] })
    expect(crew.AND[1]).toEqual({ OR: [{ page: '/my' }, { page: { startsWith: '/my?' } }] })
    expect(crew).not.toHaveProperty('OR')
    expect(crew.status.in).toEqual(['INBOX', 'TODO', 'DECISION', 'IN_PROGRESS'])
  })

  it('says the same thing as a database filter', () => {
    expect(feedbackVisibleWhere({ id: 'a', role: 'MANAGER' })).toEqual({})
    expect(feedbackVisibleWhere({ id: 'u2', role: 'SITE_MANAGER' })).toEqual({ OR: [{ officeOnly: false }, { authorId: 'u2' }] })
  })
})

describe('evidence', () => {
  it('counts changed text or an after picture as a change, a suggestion alone as a proposal', () => {
    expect(hasChange(item())).toBe(false)
    expect(hasProposal(item())).toBe(false)
    expect(hasChange(item({ beforeText: 'a', afterText: 'b' }))).toBe(true)
    expect(hasChange(item({ beforeText: 'same', afterText: 'same' }))).toBe(false)
    const picture = { id: 'f1', kind: 'after' as const, filename: 'a.png', mimeType: 'image/png', size: 1, width: 1, height: 1, url: '' }
    expect(hasChange(item({ attachments: [picture] }))).toBe(true)
    expect(hasProposal(item({ suggestion: 'Größer machen' }))).toBe(true)
  })

  it('tells a decision on older evidence from one on the current proposal', () => {
    const proposed = item({ suggestion: 'Größer', beforeText: '32px', afterText: '44px' })
    const evidence = evidenceFor(proposed)
    expect(evidenceMatches(evidence, proposed)).toBe(true)
    expect(evidenceMatches(evidence, { ...proposed, afterText: '48px' })).toBe(false)
    expect(evidenceMatches(null, proposed)).toBe(false)
  })

  it('takes the newest accept or reject, whatever notes came after', () => {
    const notes = [
      { choice: 'accept' as const, createdAt: '2026-10-01T10:00:00Z' },
      { choice: 'reject' as const, createdAt: '2026-10-02T10:00:00Z' },
      { choice: 'note' as const, createdAt: '2026-10-03T10:00:00Z' },
    ]
    expect(latestDecision(notes)?.choice).toBe('reject')
    expect(latestDecision([{ choice: 'note' as const, createdAt: 'x' }])).toBeNull()
  })
})

describe('validation', () => {
  it('makes a short title from the first line', () => {
    expect(titleFrom('\n  Zu klein  \nmehr Text')).toBe('Zu klein')
    const long = titleFrom('Das ist ein sehr langer Kommentar über einen Knopf, der auf dem Handy viel zu klein ist und kaum zu treffen', 40)
    expect(long.endsWith('…')).toBe(true)
    expect(long.length).toBeLessThanOrEqual(41)
  })

  it('wants a comment, and cleans what came with it', () => {
    expect(validateNewFeedback({ comment: '  ', page: '/', anchor: null, metadata: null })).toEqual({ ok: false, error: 'commentRequired' })
    expect(validateNewFeedback({ comment: 'x'.repeat(4001), page: '/', anchor: null, metadata: null })).toEqual({ ok: false, error: 'tooLong' })
    const ok = validateNewFeedback({ comment: ' Zu klein ', page: '/projects?board=a&comment', anchor: { selector: 'a', text: 'x', x: 3, y: -1 }, metadata: { os: 'iOS' } })
    expect(ok).toEqual({
      ok: true,
      value: { title: 'Zu klein', comment: 'Zu klein', page: '/projects?board=a', anchor: { selector: 'a', text: 'x', x: 1, y: 0 }, metadata: { os: 'iOS' } },
    })
  })

  it('takes only pages of the app', () => {
    expect(cleanPage('https://example.com/x')).toBe('')
    expect(cleanPage('//evil.example')).toBe('')
    expect(cleanPage('/my?comment&feedbackTarget=%23a')).toBe('/my')
  })

  it('drops an anchor with nothing in it and metadata too big to be the browser\'s', () => {
    expect(cleanAnchor({ x: 1 })).toBeNull()
    expect(cleanAnchor('nope')).toBeNull()
    expect(cleanMetadata({ big: 'x'.repeat(9000) })).toBeNull()
    expect(cleanMetadata([1])).toBeNull()
  })

  it('checks an edit', () => {
    const base = { title: ' T ', comment: 'c', status: 'TODO', waitingOn: '', suggestion: '', decision: '', beforeText: '  a', afterText: 'b', completionNote: '', version: 2 }
    const ok = validateEdit(base)
    expect(ok.ok && ok.value).toMatchObject({ title: 'T', waitingOn: null, beforeText: '  a', version: 2 })
    expect(validateEdit({ ...base, status: 'NOPE' })).toEqual({ ok: false, error: 'badStatus' })
    expect(validateEdit({ ...base, waitingOn: 'boss' })).toEqual({ ok: false, error: 'badWaitingOn' })
    expect(validateEdit({ ...base, version: 0 })).toEqual({ ok: false, error: 'stale' })
    expect(validateEdit({ ...base, title: '  ' })).toEqual({ ok: false, error: 'titleRequired' })
    expect(validateEdit({ ...base, beforeText: 'x'.repeat(10001) })).toEqual({ ok: false, error: 'tooLong' })
  })

  it('wants a note to say something, and a decision to have a proposal, on the current version', () => {
    const plain = item({ version: 3 })
    expect(validateNote({ choice: 'note', body: ' ', version: 3 }, plain)).toEqual({ ok: false, error: 'noteRequired' })
    expect(validateNote({ choice: 'note', body: 'Bitte 44px', version: 2 }, plain)).toEqual({ ok: false, error: 'stale' })
    expect(validateNote({ choice: 'accept', body: '', version: 3 }, plain)).toEqual({ ok: false, error: 'noProposal' })
    expect(validateNote({ choice: 'maybe', body: '', version: 3 }, plain)).toEqual({ ok: false, error: 'badChoice' })
    expect(validateNote({ choice: 'accept', body: '', version: 3 }, { ...plain, suggestion: 'Größer' })).toEqual({ ok: true, value: { choice: 'accept', body: '' } })
  })

  it('takes three picture types up to the size limit', () => {
    expect(validateImage({ size: 10, type: 'image/png' })).toBeNull()
    expect(validateImage({ size: 10, type: 'image/svg+xml' })).toBe('badImage')
    expect(validateImage({ size: 0, type: 'image/png' })).toBe('badImage')
    expect(validateImage({ size: 9 * 1024 * 1024, type: 'image/jpeg' })).toBe('imageTooLarge')
  })
})

describe('the comment switch', () => {
  it('adds and removes the bare word, keeping the rest of the address', () => {
    expect(withCommentParam('/projects')).toBe('/projects?comment')
    expect(withCommentParam('/projects?board=a#top')).toBe('/projects?board=a&comment#top')
    expect(withCommentParam('/projects?comment')).toBe('/projects?comment')
    expect(withoutCommentParam('/projects?board=a&comment#top')).toBe('/projects?board=a#top')
    expect(withoutCommentParam('/my?comment=&feedbackTarget=x')).toBe('/my')
  })

  it('links an item to its page with the element to show', () => {
    expect(pageLink(item())).toBe('/my?comment&feedbackTarget=main%20%3E%20button%3Anth-of-type(1)')
    expect(pageLink(item({ anchor: null }))).toBe('/my?comment')
    expect(pageLink(item({ page: '' }))).toBeNull()
  })
})

describe('queryFeedback', () => {
  const items = [
    item({ id: 'a', number: 1, title: 'Alpha', status: 'DONE', source: 'checklist', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z' }),
    item({ id: 'b', number: 2, title: 'Beta', status: 'TODO', waitingOn: 'client', createdAt: '2026-10-02T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z' }),
    item({ id: 'c', number: 3, title: 'Gamma', status: 'DECISION', suggestion: 'x', createdAt: '2026-10-03T00:00:00Z', updatedAt: '2026-10-03T00:00:00Z', notes: [{ id: 'n', choice: 'note', body: 'Fliesenleger fragen', itemVersion: 1, evidence: null, author: null, createdAt: 'x' }] }),
  ]
  const ids = (list: FeedbackItemDTO[]) => list.map((i) => i.id)

  it('shows newest first by default', () => {
    expect(ids(queryFeedback(items))).toEqual(['c', 'b', 'a'])
    expect(ids(queryFeedback(items, { sort: 'oldest' }))).toEqual(['a', 'b', 'c'])
    expect(ids(queryFeedback(items, { sort: 'updated' }))).toEqual(['a', 'c', 'b'])
    expect(ids(queryFeedback(items, { sort: 'status' }))).toEqual(['b', 'c', 'a'])
  })

  it('filters by status, who it waits on, source and proposal', () => {
    expect(ids(queryFeedback(items, { status: 'open' }))).toEqual(['c', 'b'])
    expect(ids(queryFeedback(items, { status: 'DONE' }))).toEqual(['a'])
    expect(ids(queryFeedback(items, { waitingOn: 'client' }))).toEqual(['b'])
    expect(ids(queryFeedback(items, { waitingOn: 'none' }))).toEqual(['c', 'a'])
    expect(ids(queryFeedback(items, { source: 'checklist' }))).toEqual(['a'])
    expect(ids(queryFeedback(items, { proposal: 'with' }))).toEqual(['c'])
  })

  it('searches every word in title, text, notes and the number', () => {
    expect(ids(queryFeedback(items, { search: 'fliesen' }))).toEqual(['c'])
    expect(ids(queryFeedback(items, { search: '#2' }))).toEqual(['b'])
    expect(ids(queryFeedback(items, { search: 'beta knopf' }))).toEqual(['b'])
    expect(ids(queryFeedback(items, { search: 'beta nichts' }))).toEqual([])
  })

  it('groups for the board with every column present', () => {
    const groups = groupByStatus(items)
    expect(Object.keys(groups)).toEqual(['INBOX', 'TODO', 'DECISION', 'IN_PROGRESS', 'DONE', 'CLOSED'])
    expect(groups.INBOX).toEqual([])
    expect(ids(groups.DONE)).toEqual(['a'])
  })

  it('counts and cleans filters', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0)
    expect(activeFilterCount({ ...DEFAULT_FILTERS, status: 'open', search: 'x' })).toBe(1)
    expect(cleanFilters({ status: 'nope', sort: 'title', search: 1 })).toEqual({ ...DEFAULT_FILTERS, sort: 'title' })
    expect(cleanFilters(null)).toEqual(DEFAULT_FILTERS)
  })

  it('ticks an item off and back on', () => {
    expect(toggledStatus('INBOX')).toBe('DONE')
    expect(toggledStatus('DONE')).toBe('TODO')
    expect(toggledStatus('CLOSED')).toBe('TODO')
  })
})

describe('wordDiff', () => {
  const join = (parts: ReturnType<typeof wordDiff>, keep: string[]) => parts.filter((p) => keep.includes(p.type)).map((p) => p.text).join('')

  it('marks the changed words and reads back both sides exactly', () => {
    const before = 'Termin am Montag bestätigen'
    const after = 'Termin am Dienstag  bestätigen'
    const parts = wordDiff(before, after)
    expect(join(parts, ['same', 'del'])).toBe(before)
    expect(join(parts, ['same', 'add'])).toBe(after)
    expect(parts.find((p) => p.type === 'del')?.text).toContain('Montag')
    expect(parts.find((p) => p.type === 'add')?.text).toContain('Dienstag')
  })

  it('handles empty sides and gives up gracefully on very long text', () => {
    expect(wordDiff('', 'neu')).toEqual([{ type: 'add', text: 'neu' }])
    expect(wordDiff('alt', '')).toEqual([{ type: 'del', text: 'alt' }])
    expect(wordDiff('a b c', 'a b d', 2)).toEqual([{ type: 'del', text: 'a b c' }, { type: 'add', text: 'a b d' }])
  })
})

describe('feedbackHandoff', () => {
  it('exports the shown items with notes, decisions tied to evidence, and image references', () => {
    const proposed = item({
      suggestion: 'Größer',
      beforeText: '32px',
      afterText: '44px',
      attachments: [{ id: 'f1', kind: 'screenshot', filename: 'Seite.jpg', mimeType: 'image/jpeg', size: 9, width: 1200, height: 800, url: '/api/feedback/attachments/f1' }],
    })
    const stale = evidenceFor({ ...proposed, afterText: '40px' })
    proposed.notes = [
      { id: 'n1', choice: 'accept', body: '', itemVersion: 1, evidence: stale, author: { id: 'a', name: 'Büro' }, createdAt: '2026-10-30T11:00:00Z' },
      { id: 'n2', choice: 'note', body: 'Auch im Lager', itemVersion: 1, evidence: null, author: null, createdAt: '2026-10-30T12:00:00Z' },
    ]
    const out = feedbackHandoff([proposed], { origin: 'https://app.example', exportedAt: '2026-10-31T00:00:00Z' })
    expect(out.project).toBe('BauCrew')
    expect(out.exportedAt).toBe('2026-10-31T00:00:00Z')
    const [first] = out.items
    expect(first.number).toBe(64)
    expect(first.pageLink).toMatch(/^https:\/\/app\.example\/my\?comment&feedbackTarget=/)
    expect(first.images).toEqual([{ id: 'f1', kind: 'screenshot', filename: 'Seite.jpg', width: 1200, height: 800, url: 'https://app.example/api/feedback/attachments/f1' }])
    expect(first.proposal).toMatchObject({ suggestion: 'Größer', hasChange: true })
    expect(first.notes.map((n) => n.choice)).toEqual(['note', 'accept'])
    expect(first.notes[0]).not.toHaveProperty('evidenceMatchesCurrent')
    expect(first.notes[1].evidenceMatchesCurrent).toBe(false)
    expect(JSON.stringify(out)).not.toContain('base64')
  })

  it('leaves the proposal out where there is none', () => {
    expect(feedbackHandoff([item()]).items[0].proposal).toBeNull()
  })
})

describe('sniffImageType', () => {
  it('trusts the bytes, not the name', () => {
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png')
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(sniffImageType(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp')
    expect(sniffImageType(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull()
  })
})
