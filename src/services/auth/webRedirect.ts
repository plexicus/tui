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

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function authPage(opts: { ok: boolean; title: string; message: string }): string {
  const icon = opts.ok
    ? '<div class="badge ok">&#10003;</div>'
    : '<div class="badge err">&#10005;</div>'
  return `<!doctype html><html><head><meta charset="utf-8"><title>Plexicus</title><style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    background:linear-gradient(135deg,#3b1670 0%,#923bfe 100%)}
  .card{background:#fff;border-radius:16px;padding:3em 3.5em;text-align:center;
    box-shadow:0 20px 60px rgba(0,0,0,.35);max-width:26em}
  .badge{width:64px;height:64px;border-radius:50%;margin:0 auto 1.2em;color:#fff;
    font-size:2em;line-height:64px}
  .badge.ok{background:#923bfe}
  .badge.err{background:#e5484d}
  h1{margin:0 0 .4em;font-size:1.4em;color:#1a1523}
  p{margin:.3em 0;color:#6f6e77;font-size:.95em}
  .brand{margin-top:2em;font-weight:700;letter-spacing:.12em;font-size:.75em;color:#923bfe}
  </style></head><body><div class="card">${icon}
  <h1>${opts.title}</h1>
  <p>${opts.message}</p>
  <p>You can close this tab and return to your terminal.</p>
  <div class="brand">PLEXICUS</div>
  </div></body></html>`
}

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

          const htmlHeaders = { 'Content-Type': 'text/html; charset=utf-8' }

          if (!token || !email || !echoState) {
            return new Response(
              authPage({ ok: false, title: 'Authentication failed', message: 'The redirect from the web app was missing required parameters. Run <code>plexicus login</code> again.' }),
              { status: 400, headers: htmlHeaders },
            )
          }
          if (echoState !== nonce) {
            return new Response(
              authPage({ ok: false, title: 'Authentication failed', message: 'Security check failed (state mismatch). Run <code>plexicus login</code> again.' }),
              { status: 400, headers: htmlHeaders },
            )
          }

          queueMicrotask(() => resolveResult({ token, email }))
          return new Response(
            authPage({ ok: true, title: "You're authenticated", message: `Signed in as <strong>${escapeHtml(email)}</strong>.` }),
            { headers: htmlHeaders },
          )
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
    // Graceful stop first: the success promise resolves while the browser's
    // response is still in flight — stop(true) here would reset the socket
    // and the user would never see the confirmation page.
    server.stop()
    await Bun.sleep(300)
    server.stop(true)
  }
}
