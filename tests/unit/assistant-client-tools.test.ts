import { describe, expect, it } from 'vitest'
import type { UIMessage } from 'ai'
import { openQuestion, proposalWaiting, readQuestion, safeAppPath, shouldContinue } from '@/lib/assistant-client-tools'
import { chatGroup, chatTitle, groupChats, isChatId } from '@/lib/assistant-history'

const assistant = (parts: unknown[]): UIMessage => ({ id: 'a', role: 'assistant', parts: [{ type: 'step-start' }, ...parts] as UIMessage['parts'] })
const user = (text: string): UIMessage => ({ id: 'u', role: 'user', parts: [{ type: 'text', text }] })
const tool = (name: string, state: string, extra: object = {}) => ({ type: `tool-${name}`, toolCallId: `c-${name}`, state, input: {}, ...extra })

describe('safeAppPath', () => {
  it('opens pages of the app', () => {
    expect(safeAppPath('/projects/cmabc123')).toBe('/projects/cmabc123')
    expect(safeAppPath('/schedule?week=2026-11-16')).toBe('/schedule?week=2026-11-16')
    expect(safeAppPath(' /customers ')).toBe('/customers')
  })

  it('never leads out of the app or into what is not a page', () => {
    for (const bad of [
      'https://example.com',
      '//example.com/projects',
      '/\\example.com',
      'javascript:alert(1)',
      '/api/assistant',
      '/login',
      '/projects/<script>',
      '/projects/a b',
      'projects',
      42,
      null,
      `/projects/${'x'.repeat(400)}`,
    ]) {
      expect(safeAppPath(bad), String(bad)).toBeNull()
    }
  })
})

describe('readQuestion', () => {
  it('keeps the question and its answers', () => {
    expect(readQuestion({ question: ' Welcher Kunde? ', options: ['Muster GmbH', '', 'Beispiel AG', 7] })).toEqual({
      question: 'Welcher Kunde?',
      options: ['Muster GmbH', 'Beispiel AG'],
    })
  })
  it('refuses what is not a question', () => {
    expect(readQuestion({ question: '', options: ['a', 'b'] })).toBeNull()
    expect(readQuestion({ question: 'x' })).toBeNull()
    expect(readQuestion(null)).toBeNull()
  })
})

describe('shouldContinue', () => {
  it('sends again once a page is opened or a question answered', () => {
    expect(shouldContinue({ messages: [user('öffne'), assistant([tool('open_page', 'output-available', { output: { opened: '/x' } })])] })).toBe(true)
    expect(shouldContinue({ messages: [user('?'), assistant([tool('ask_user', 'output-available', { output: { answer: 'A' } })])] })).toBe(true)
  })

  it('waits while a question is open', () => {
    const messages = [user('?'), assistant([tool('ask_user', 'input-available')])]
    expect(shouldContinue({ messages })).toBe(false)
    expect(openQuestion(messages)).toEqual({ toolCallId: 'c-ask_user' })
  })

  it('never sends again after look-ups alone — that would loop', () => {
    expect(shouldContinue({ messages: [user('?'), assistant([tool('list_projects', 'output-available', { output: [] })])] })).toBe(false)
  })

  it('waits for a proposal and sends once it is answered', () => {
    const waiting = [user('x'), assistant([tool('update_project', 'approval-requested', { approval: { id: 'p' } })])]
    expect(proposalWaiting(waiting)).toBe(true)
    expect(shouldContinue({ messages: waiting })).toBe(false)
    const answered = [user('x'), assistant([tool('update_project', 'approval-responded', { approval: { id: 'p', approved: true } })])]
    expect(proposalWaiting(answered)).toBe(false)
    expect(shouldContinue({ messages: answered })).toBe(true)
  })

  it('does nothing after the person spoke last', () => {
    expect(shouldContinue({ messages: [user('hallo')] })).toBe(false)
  })
})

describe('conversation history', () => {
  it('names a conversation after its first question', () => {
    expect(chatTitle([user('  Welche   Projekte\nlaufen? '), user('und morgen?')])).toBe('Welche Projekte laufen?')
    const long = chatTitle([user(`Lege ein Projekt für die Muster GmbH an, ${'mit vielen Angaben '.repeat(10)}`)])
    expect(long.length).toBeLessThanOrEqual(81)
    expect(long.endsWith('…')).toBe(true)
    expect(chatTitle([])).toBe('')
  })

  it('takes only ids the panel makes', () => {
    expect(isChatId('0b6c3f0e-5a7d-4a51-9c1e-2f3a4b5c6d7e')).toBe(true)
    expect(isChatId('short')).toBe(false)
    expect(isChatId('../../etc/passwd')).toBe(false)
    expect(isChatId(undefined)).toBe(false)
  })

  it('cuts the history into days', () => {
    const now = new Date(2026, 10, 2, 9, 0)
    expect(chatGroup(new Date(2026, 10, 2, 0, 5), now)).toBe('today')
    expect(chatGroup(new Date(2026, 10, 1, 23, 50), now)).toBe('yesterday')
    expect(chatGroup(new Date(2026, 9, 28, 12), now)).toBe('week')
    expect(chatGroup(new Date(2026, 9, 1), now)).toBe('older')
    const groups = groupChats(
      [
        { id: 'a', updatedAt: new Date(2026, 9, 1).toISOString() },
        { id: 'b', updatedAt: new Date(2026, 10, 2, 8).toISOString() },
        { id: 'c', updatedAt: new Date(2026, 10, 2, 7).toISOString() },
      ],
      now
    )
    expect(groups.map((g) => [g.group, g.chats.map((c) => c.id)])).toEqual([
      ['today', ['b', 'c']],
      ['older', ['a']],
    ])
  })
})
