import { describe, it, expect, mock } from 'bun:test'
import { runSupport, contextSuffix, type SupportIO } from '../../src/commands/support.js'
import { PlexicusApi } from '../../src/services/plexicusApi.js'
import { PlexicusApiError } from '../../src/utils/errors.js'
import { validateSupportTicket } from '../../src/services/contract.js'

const config = { serverUrl: 'https://api.test.example', webUrl: undefined }

function io(answers: Array<string | null>) {
  const printed: string[] = []
  const prompts: string[] = []
  const queue = [...answers]
  const sio: SupportIO = {
    ask: async p => {
      prompts.push(p)
      return queue.length ? queue.shift()! : null
    },
    print: l => printed.push(l),
  }
  return { sio, printed, prompts }
}

describe('plexicus support', () => {
  it('asks for confirmation and posts source "tui" with a context line', async () => {
    const created: unknown[] = []
    const api = { createSupportTicket: async (t: unknown) => (created.push(t), 'tkt-1') }
    const { sio, prompts } = io(['y'])
    const out = await runSupport(config, 'tok', { category: 'bug', subject: 'Crash on start', message: 'It crashes.' }, sio, api)
    expect(out).toEqual({ sent: true, ticketId: 'tkt-1' })
    expect(prompts.some(p => p.includes('Send this ticket'))).toBe(true)
    const t = created[0] as { message: string; category: string }
    expect(t.category).toBe('bug')
    expect(t.message.startsWith('It crashes.')).toBe(true)
    expect(t.message.endsWith(contextSuffix().trim().split('\n').pop()!)).toBe(true)
  })

  it('sends nothing when the user declines', async () => {
    let called = false
    const api = { createSupportTicket: async () => ((called = true), 'x') }
    const out = await runSupport(config, 'tok', { subject: 's', message: 'm' }, io(['n']).sio, api)
    expect(out.sent).toBe(false)
    expect(called).toBe(false)
  })

  it('POSTs /support/tickets with source tui through the real client', async () => {
    const orig = globalThis.fetch
    let seen: { url: string; body: Record<string, string>; method: string } | undefined
    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      seen = { url: String(url), body: JSON.parse(String(init?.body)), method: String(init?.method) }
      return new Response(JSON.stringify({ data: { id: 'abc123', attributes: {} } }), { status: 201 })
    }) as unknown as typeof fetch
    try {
      const api = new PlexicusApi({ baseUrl: 'https://api.test.example', token: 'tok' })
      const id = await api.createSupportTicket({ subject: ' Hi ', message: ' Body ', category: 'question' })
      expect(id).toBe('abc123')
      expect(seen!.url).toBe('https://api.test.example/support/tickets')
      expect(seen!.method).toBe('POST')
      expect(seen!.body).toEqual({ subject: 'Hi', message: 'Body', category: 'question', source: 'tui' })
    } finally {
      globalThis.fetch = orig
    }
  })

  it('prints the in-app URL on 403', async () => {
    const api = { createSupportTicket: async () => { throw new PlexicusApiError('forbidden', 403, '/support/tickets') } }
    const out = await runSupport({ serverUrl: 'https://api.app.plexicus.ai', webUrl: undefined }, 'tok', { subject: 's', message: 'm', yes: true }, io([]).sio, api)
    expect(out.sent).toBe(false)
    expect(out.reason).toContain('https://app.plexicus.ai')
  })

  it('explains 429 and a missing route', async () => {
    const mk = (status: number) => ({ createSupportTicket: async () => { throw new PlexicusApiError('x', status, '/support/tickets') } })
    expect((await runSupport(config, 't', { subject: 's', message: 'm', yes: true }, io([]).sio, mk(429))).reason).toContain('Too many')
    expect((await runSupport(config, 't', { subject: 's', message: 'm', yes: true }, io([]).sio, mk(404))).reason).toContain('no in-app support')
  })

  it('validates categories and lengths before sending', () => {
    expect(validateSupportTicket({ category: 'billing', subject: 'a', message: 'b' })).toBeNull()
    expect(validateSupportTicket({ category: 'nope' as never, subject: 'a', message: 'b' })).toContain('category')
    expect(validateSupportTicket({ category: 'bug', subject: 'x'.repeat(201), message: 'b' })).toContain('200')
    expect(validateSupportTicket({ category: 'bug', subject: 'a', message: 'x'.repeat(5001) })).toContain('5000')
    expect(validateSupportTicket({ category: 'bug', subject: 'a', message: 'x'.repeat(5000) }, '12345')).toContain('4995')
    expect(validateSupportTicket({ category: 'bug', subject: '  ', message: 'b' })).toContain('subject')
  })

  it('refuses text that looks like a token and never sends it', async () => {
    let called = false
    const api = { createSupportTicket: async () => ((called = true), 'x') }
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1In0.c2lnc2lnc2ln'
    const out = await runSupport(config, 'tok', { subject: 's', message: `my token is ${jwt}`, yes: true }, io([]).sio, api)
    expect(out.sent).toBe(false)
    expect(out.reason).toContain('token or secret')
    expect(called).toBe(false)
  })

  it('reads a multi-line message until a line with a single dot', async () => {
    const created: Array<{ message: string }> = []
    const api = { createSupportTicket: async (t: { message: string }) => (created.push(t), 'k') }
    const { sio } = io(['question', 'Subject here', 'line one', 'line two', '.', 'y'])
    const out = await runSupport(config, 'tok', {}, sio, api)
    expect(out.sent).toBe(true)
    expect(created[0]!.message.startsWith('line one\nline two')).toBe(true)
  })
})
