import { randomUUID } from 'node:crypto'

export interface WebRedirectResult {
  token: string
  email: string
}

export interface WebRedirectOptions {
  timeoutMs?: number
  signal?: AbortSignal
}

const PORT_MIN = 9100
const PORT_MAX = 9199

const SUCCESS_HTML = `<html><body style="font-family:sans-serif;text-align:center;padding:4em">
  <h1>Plexicus TUI authorized</h1>
  <p>You can close this tab and return to your terminal.</p>
</body></html>`

export async function loginViaWebRedirect(
  webUrl: string,
  opts: WebRedirectOptions = {},
): Promise<WebRedirectResult> {
  const timeoutMs = opts.timeoutMs ?? 120_000
  const nonce = randomUUID()

  let resolveResult!: (v: WebRedirectResult) => void
  let rejectResult!: (e: Error) => void
  const resultPromise = new Promise<WebRedirectResult>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })

  // Bind local server BEFORE opening browser (security: server must be ready first)
  let server: ReturnType<typeof Bun.serve> | null = null
  let port = 0

  for (let p = PORT_MIN; p <= PORT_MAX; p++) {
    try {
      server = Bun.serve({
        port: p,
        hostname: '127.0.0.1',
        fetch(req) {
          const url = new URL(req.url)
          const token = url.searchParams.get('token')
          const email = url.searchParams.get('email')
          const echoState = url.searchParams.get('state')

          if (!token || !email || !echoState) {
            return new Response('Missing parameters', { status: 400 })
          }
          if (echoState !== nonce) {
            return new Response('State mismatch', { status: 400 })
          }

          queueMicrotask(() => resolveResult({ token, email }))
          return new Response(SUCCESS_HTML, {
            headers: { 'Content-Type': 'text/html' },
          })
        },
      })
      port = p
      break
    } catch {
      // EADDRINUSE — try next port
    }
  }

  if (!server) {
    throw new Error(`No free port available in range [${PORT_MIN}, ${PORT_MAX}]`)
  }

  // Open browser after server is bound
  const target = `${webUrl}/auth/cli?port=${port}&state=${encodeURIComponent(nonce)}`
  try {
    if (process.platform === 'darwin') {
      await Bun.$`open ${target}`.quiet()
    } else if (process.platform === 'linux') {
      await Bun.$`xdg-open ${target}`.quiet()
    } else {
      console.log(`Open this URL in your browser:\n  ${target}`)
    }
  } catch {
    console.log(`Open this URL in your browser:\n  ${target}`)
  }

  const timeoutPromise = new Promise<never>((_, reject) => {
    const t = setTimeout(
      () => reject(new Error(`Login timed out after ${Math.round(timeoutMs / 1000)}s — run \`plexicus login --headless\` if you have no browser`)),
      timeoutMs,
    )
    opts.signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new Error('Login aborted'))
    })
  })

  try {
    return await Promise.race([resultPromise, timeoutPromise])
  } finally {
    server.stop(true)
  }
}
