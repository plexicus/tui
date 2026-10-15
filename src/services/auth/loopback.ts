import { createServer, type Server } from 'node:http'
import { authPage } from './callbackPage.js'
import { LoginError } from './errors.js'
import { safeEqual } from './pkce.js'

export const PORT_MIN = 9100
export const PORT_MAX = 9199
export const LOOPBACK_TIMEOUT_MS = 120_000

export interface LoopbackOptions {
  state: string
  timeoutMs?: number
  portMin?: number
  portMax?: number
}

export interface LoopbackHandle {
  port: number
  redirectUri: string
  /** Resolves with the authorization code of the first valid callback; rejects on error/timeout. */
  result: Promise<{ code: string }>
  close(): void
}

const HTML = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }

function listen(server: Server, port: number): Promise<boolean> {
  return new Promise(resolve => {
    const onError = () => resolve(false)
    server.once('error', onError)
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', onError)
      resolve(true)
    })
  })
}

/**
 * Loopback receiver for the PKCE flow (AUTH-API-CONTRACT.md, flow A).
 *  - binds 127.0.0.1 only, first free port in 9100-9199, BEFORE the browser is opened
 *  - answers only `GET /callback` (anything else: 404, other methods on /callback: 405)
 *  - state compared in constant time; a bad/missing state is a 400 and the code is NOT used
 *  - single use: the first valid callback closes the server immediately
 *  - 120 s default timeout
 * Neither the query string nor the code is ever logged.
 */
export async function startLoopback(opts: LoopbackOptions): Promise<LoopbackHandle> {
  const min = opts.portMin ?? PORT_MIN
  const max = opts.portMax ?? PORT_MAX
  const timeoutMs = opts.timeoutMs ?? LOOPBACK_TIMEOUT_MS

  let finished = false
  let settle!: { resolve: (v: { code: string }) => void; reject: (e: Error) => void }
  const result = new Promise<{ code: string }>((resolve, reject) => {
    settle = { resolve, reject }
  })
  // The caller may not be awaiting yet when the timer fires.
  result.catch(() => {})

  let port = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  const server = createServer((req, res) => {
    const reply = (status: number, body: string, extra: Record<string, string> = {}) => {
      res.writeHead(status, { ...HTML, ...extra, Connection: 'close' })
      res.end(body)
    }
    if (finished) return reply(404, '')
    let url: URL
    try {
      url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
    } catch {
      return reply(400, '')
    }
    if (url.pathname !== '/callback') return reply(404, '')
    if (req.method !== 'GET') return reply(405, '', { Allow: 'GET' })

    const host = req.headers.host ?? ''
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return reply(400, '')

    const got = url.searchParams.get('state') ?? ''
    if (!got || !safeEqual(got, opts.state)) {
      return reply(
        400,
        authPage({
          ok: false,
          title: 'Authentication failed',
          message: 'Security check failed (state mismatch). Run <code>plexicus login</code> again.',
        }),
      )
    }

    const code = url.searchParams.get('code')
    const error = url.searchParams.get('error')
    finished = true
    if (timer) clearTimeout(timer)
    // Stop accepting immediately; the response below still goes out on the open socket.
    server.close()

    if (error || !code) {
      reply(
        400,
        authPage({
          ok: false,
          title: error === 'access_denied' ? 'Access denied' : 'Authentication failed',
          message:
            error === 'access_denied'
              ? 'The request was denied in the browser.'
              : 'The callback did not carry an authorization code.',
        }),
      )
      settle.reject(
        error === 'access_denied'
          ? new LoginError('access_denied', 'The login was denied in the browser.')
          : new LoginError('client_error', 'The browser callback did not carry an authorization code. Run `plexicus login` again.'),
      )
      return
    }

    reply(
      200,
      authPage({ ok: true, title: "You're authenticated", message: 'Plexicus TUI is now authorized on this device.' }),
    )
    settle.resolve({ code })
  })

  let bound = false
  for (let p = min; p <= max; p++) {
    if (await listen(server, p)) {
      port = p
      bound = true
      break
    }
  }
  if (!bound) {
    throw new LoginError('no_port', `No free loopback port in ${min}-${max}; use \`plexicus login --device\`.`)
  }

  const close = () => {
    finished = true
    if (timer) clearTimeout(timer)
    try {
      server.close()
    } catch {
      // already closed
    }
    server.closeIdleConnections?.()
  }

  timer = setTimeout(() => {
    if (finished) return
    close()
    settle.reject(
      new LoginError('timeout', `Login timed out after ${Math.round(timeoutMs / 1000)}s. Run \`plexicus login --device\` if the browser cannot reach this machine.`),
    )
  }, timeoutMs)

  const afterSettle = () => {
    // closeAllConnections after the response has been flushed
    setTimeout(() => server.closeAllConnections?.(), 500).unref?.()
  }
  result.then(afterSettle, afterSettle)

  return { port, redirectUri: `http://127.0.0.1:${port}/callback`, result, close }
}
