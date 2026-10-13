import { describe, it, expect } from 'bun:test'
import { deviceLogin } from '../../src/services/auth/device.js'
import { exchangeCode, type FetchFn } from '../../src/services/auth/oauthClient.js'
import { LoginError } from '../../src/services/auth/errors.js'

const API = 'https://api.test.example'
const START = { device_code: 'plxd_dummy', user_code: 'WDJB-MJHT', verification_uri: 'https://app.test.example/activate', expires_in: 600, interval: 5 }
const TOKEN = { access_token: 'tok.dummy.value', token_type: 'bearer', expires_in: 7776000, scope: 'read' }

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

/** Virtual clock + scripted server. */
function harness(pollReplies: Array<Response | (() => Response)>) {
  let t = 1_000_000
  const sleeps: number[] = []
  const calls: Array<{ url: string; body: URLSearchParams; headers: Record<string, string> }> = []
  let poll = 0
  const fetchFn = (async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      body: new URLSearchParams(String(init?.body ?? '')),
      headers: init?.headers as Record<string, string>,
    })
    if (url.endsWith('/oauth/device_authorization')) return json(200, START)
    const r = pollReplies[Math.min(poll++, pollReplies.length - 1)]!
    return typeof r === 'function' ? r() : r.clone() // keep the original unread so it can be replayed
  }) as unknown as FetchFn
  return {
    calls,
    sleeps,
    opts: {
      apiUrl: API,
      deviceName: 'laptop-01',
      fetch: fetchFn,
      onPrompt: () => {},
      sleep: async (ms: number) => {
        sleeps.push(ms)
        t += ms
      },
      now: () => t,
    },
  }
}

describe('device flow state machine', () => {
  it('waits `interval`, adds 5 s on slow_down and returns the token', async () => {
    const h = harness([
      json(400, { error: 'authorization_pending' }),
      json(400, { error: 'slow_down' }),
      json(400, { error: 'authorization_pending' }),
      json(200, TOKEN),
    ])
    const token = await deviceLogin(h.opts)
    expect(token.access_token).toBe('tok.dummy.value')
    expect(h.sleeps).toEqual([5000, 5000, 10000, 10000])
  })

  it('sends client id, grant type and the client header on every request', async () => {
    const h = harness([json(200, TOKEN)])
    await deviceLogin(h.opts)
    const [auth, poll] = h.calls
    expect(auth!.url).toBe(`${API}/oauth/device_authorization`)
    expect(auth!.body.get('client_id')).toBe('plexicus-tui')
    expect(auth!.body.get('device_name')).toBe('laptop-01')
    expect(poll!.url).toBe(`${API}/oauth/token`)
    expect(poll!.body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:device_code')
    expect(poll!.body.get('device_code')).toBe('plxd_dummy')
    for (const c of h.calls) expect(c.headers['X-Plexicus-Client']).toMatch(/^tui\//)
  })

  it('prints the verification URI and the user code', async () => {
    const h = harness([json(200, TOKEN)])
    let prompted = ''
    await deviceLogin({ ...h.opts, onPrompt: a => (prompted = `${a.verification_uri} ${a.user_code}`) })
    expect(prompted).toBe('https://app.test.example/activate WDJB-MJHT')
  })

  it.each([
    ['access_denied', 'access_denied'],
    ['expired_token', 'expired_token'],
    ['invalid_grant', 'invalid_grant'],
    ['invalid_client', 'client_error'],
    ['unsupported_grant_type', 'client_error'],
  ])('stops on terminal error %s', async (error, code) => {
    const h = harness([json(400, { error })])
    const err = await deviceLogin(h.opts).catch(e => e)
    expect(err).toBeInstanceOf(LoginError)
    expect(err.code).toBe(code)
    expect(h.calls.filter(c => c.url.endsWith('/oauth/token'))).toHaveLength(1)
  })

  it('backs off 60 s on HTTP 429 and keeps polling', async () => {
    const h = harness([json(429, { error: 'rate_limited' }), json(200, TOKEN)])
    await deviceLogin(h.opts)
    expect(h.sleeps).toEqual([5000, 60000, 5000])
  })

  it('gives up with expired_token at the server deadline', async () => {
    const h = harness([json(400, { error: 'authorization_pending' })])
    const err = await deviceLogin(h.opts).catch(e => e)
    expect(err.code).toBe('expired_token')
    expect(h.sleeps.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(600_000)
  })

  it.each([410, 426])('reports upgrade required on HTTP %i', async status => {
    const h = harness([json(status, { error: 'upgrade_required' })])
    const err = await deviceLogin(h.opts).catch(e => e)
    expect(err.code).toBe('upgrade_required')
  })
})

describe('authorization code exchange', () => {
  const base = { apiUrl: API, code: 'plxc_dummy', verifier: 'v'.repeat(43), redirectUri: 'http://127.0.0.1:9123/callback', state: 'state-0123456789abcdef' }

  it('posts the PKCE verifier, redirect_uri and state', async () => {
    let body!: URLSearchParams
    let headers: Record<string, string> = {}
    const token = await exchangeCode({
      ...base,
      fetch: async (_u, init) => {
        body = new URLSearchParams(String(init?.body))
        headers = init?.headers as Record<string, string>
        return json(200, TOKEN)
      },
    })
    expect(token.access_token).toBe('tok.dummy.value')
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code_verifier')).toBe(base.verifier)
    expect(body.get('redirect_uri')).toBe(base.redirectUri)
    expect(body.get('state')).toBe(base.state)
    expect(body.get('client_id')).toBe('plexicus-tui')
    expect(headers['X-Plexicus-Client']).toMatch(/^tui\//)
  })

  it('never retries on invalid_grant: one request, "start login again"', async () => {
    let n = 0
    const err = await exchangeCode({
      ...base,
      fetch: async () => {
        n++
        return json(400, { error: 'invalid_grant', error_description: 'The authorization code is invalid, expired or already used.' })
      },
    }).catch(e => e)
    expect(n).toBe(1)
    expect(err.code).toBe('invalid_grant')
    expect(err.message).toContain('Start the login again')
  })

  it.each([410, 426])('maps %i to upgrade required', async status => {
    const err = await exchangeCode({ ...base, fetch: async () => json(status, { error: 'upgrade_required' }) }).catch(e => e)
    expect(err.code).toBe('upgrade_required')
    expect(err.message).toContain('Upgrade')
  })

  it('does not leak the code or verifier into network error messages', async () => {
    const err = await exchangeCode({
      ...base,
      fetch: async () => {
        throw new Error(`connect failed for code=${base.code}`)
      },
    }).catch(e => e)
    expect(err.message).not.toContain('plxc_dummy')
    expect(err.message).not.toContain(base.verifier)
  })
})
