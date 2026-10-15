import { describe, it, expect } from 'bun:test'
import { interactiveLogin } from '../../src/services/auth/login.js'
import { challengeS256 } from '../../src/services/auth/pkce.js'
import type { FetchFn } from '../../src/services/auth/oauthClient.js'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
const TOKEN = { access_token: 'tok.dummy.value', token_type: 'bearer', scope: 'read' }

describe('interactiveLogin', () => {
  it('runs loopback + PKCE: the exchanged verifier matches the challenge sent to the browser', async () => {
    let authorizeUrl!: URL
    let exchange!: URLSearchParams
    const fetchFn: FetchFn = async (url, init) => {
      if (url.endsWith('/auth/cli/token')) {
        exchange = new URLSearchParams(String(init?.body))
        return json(200, TOKEN)
      }
      throw new Error(`unexpected ${url}`)
    }
    const out = await interactiveLogin({
      apiUrl: 'https://api.test.example',
      webUrl: 'https://app.test.example',
      mode: 'auto',
      canOpenBrowser: true,
      print: () => {},
      fetch: fetchFn,
      loopbackTimeoutMs: 5000,
      openBrowser: async url => {
        authorizeUrl = new URL(url)
        // the "browser": redirect back to the loopback with a code and the same state
        const port = authorizeUrl.searchParams.get('port')
        const state = authorizeUrl.searchParams.get('state')
        setTimeout(() => {
          void fetch(`http://127.0.0.1:${port}/callback?code=plxc_dummy&state=${state}`)
        }, 10)
        return true
      },
    })
    expect(out.access_token).toBe('tok.dummy.value')
    expect(authorizeUrl.origin + authorizeUrl.pathname).toBe('https://app.test.example/auth/cli')
    expect(authorizeUrl.searchParams.get('client_id')).toBe('plexicus-tui')
    expect(authorizeUrl.searchParams.get('code_challenge_method')).toBe('S256')
    const port = Number(authorizeUrl.searchParams.get('port'))
    expect(port).toBeGreaterThanOrEqual(9100)
    expect(port).toBeLessThanOrEqual(9199)
    expect(challengeS256(exchange.get('code_verifier')!)).toBe(authorizeUrl.searchParams.get('code_challenge')!)
    expect(exchange.get('state')).toBe(authorizeUrl.searchParams.get('state')!)
    expect(exchange.get('redirect_uri')).toBe(`http://127.0.0.1:${port}/callback`)
    expect(exchange.get('code')).toBe('plxc_dummy')
  })

  const deviceFetch: FetchFn = async url =>
    url.endsWith('/oauth/device_authorization')
      ? json(200, { device_code: 'plxd_x', user_code: 'ABCD-EFGH', verification_uri: 'https://app.test.example/activate', expires_in: 600, interval: 5 })
      : json(200, TOKEN)
  const noSleep = async () => {}

  it('selects the device flow when no browser can be opened, and says so', async () => {
    const lines: string[] = []
    const out = await interactiveLogin({
      apiUrl: 'https://api.test.example', webUrl: 'https://app.test.example', mode: 'auto',
      canOpenBrowser: false, openBrowser: async () => true, print: l => lines.push(l), fetch: deviceFetch, sleep: noSleep,
    })
    expect(out.access_token).toBe('tok.dummy.value')
    expect(lines.join('\n')).toContain('device flow')
    expect(lines.join('\n')).toContain('ABCD-EFGH')
  })

  it('falls back to the device flow (visibly) when the browser fails to open', async () => {
    const lines: string[] = []
    const out = await interactiveLogin({
      apiUrl: 'https://api.test.example', webUrl: 'https://app.test.example', mode: 'auto',
      canOpenBrowser: true, openBrowser: async () => false, print: l => lines.push(l), fetch: deviceFetch, sleep: noSleep,
    })
    expect(out.access_token).toBe('tok.dummy.value')
    expect(lines.join('\n')).toContain('Could not open a browser')
  })

  it('--device never touches the browser', async () => {
    let opened = false
    await interactiveLogin({
      apiUrl: 'https://api.test.example', webUrl: 'https://app.test.example', mode: 'device',
      canOpenBrowser: true, openBrowser: async () => ((opened = true), true), print: () => {}, fetch: deviceFetch, sleep: noSleep,
    })
    expect(opened).toBe(false)
  })
})
