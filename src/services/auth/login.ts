import { hostname } from 'node:os'
import { CLIENT_ID } from '../../utils/clientInfo.js'
import { deviceLogin } from './device.js'
import { LoginError } from './errors.js'
import { startLoopback } from './loopback.js'
import { exchangeCode, type DeviceAuthorization, type FetchFn, type TokenResponse } from './oauthClient.js'
import { challengeS256, generateState, generateVerifier } from './pkce.js'

export type LoginMode = 'auto' | 'device'

export interface InteractiveLoginOptions {
  apiUrl: string
  /** Web app origin that serves /auth/cli and /activate; null when it cannot be derived. */
  webUrl: string | null
  mode: LoginMode
  scope?: string
  canOpenBrowser: boolean
  openBrowser: (url: string) => Promise<boolean>
  print: (line: string) => void
  deviceName?: string
  fetch?: FetchFn
  loopbackTimeoutMs?: number
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

// The server sanitises to [A-Za-z0-9 ._-] (64 chars); do it here too so the display name is predictable.
export function defaultDeviceName(): string {
  const raw = (() => {
    try {
      return hostname()
    } catch {
      return 'tui'
    }
  })()
  return raw.replace(/[^A-Za-z0-9 ._-]/g, '').slice(0, 64) || 'tui'
}

export function buildAuthorizeUrl(p: {
  webUrl: string
  port: number
  state: string
  challenge: string
  deviceName: string
  scope: string
}): string {
  const q = new URLSearchParams({
    client_id: CLIENT_ID,
    port: String(p.port),
    state: p.state,
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
    device: p.deviceName,
    scope: p.scope,
  })
  return `${p.webUrl.replace(/\/$/, '')}/auth/cli?${q.toString()}`
}

function printDevicePrompt(print: (l: string) => void, auth: DeviceAuthorization) {
  print(`Open ${auth.verification_uri} and enter the code:  ${auth.user_code}`)
  print('Waiting for approval in the browser (Ctrl+C to cancel)...')
}

async function runDevice(o: InteractiveLoginOptions): Promise<TokenResponse> {
  return deviceLogin({
    apiUrl: o.apiUrl,
    deviceName: o.deviceName ?? defaultDeviceName(),
    scope: o.scope,
    fetch: o.fetch,
    onPrompt: a => printDevicePrompt(o.print, a),
    sleep: o.sleep,
    now: o.now,
  })
}

/**
 * Interactive login. `auto` = loopback + PKCE; it switches to the device flow (and says so)
 * when no browser can be opened, the web URL is unknown, or no loopback port is free.
 * Never asks for a password and never accepts a token.
 */
export async function interactiveLogin(o: InteractiveLoginOptions): Promise<TokenResponse> {
  if (o.mode === 'device') return runDevice(o)

  if (!o.canOpenBrowser || !o.webUrl) {
    o.print(
      !o.webUrl
        ? 'webUrl is not configured (set it with `plexicus config set webUrl <url>`); using the device flow.'
        : 'No browser available on this machine; using the device flow.',
    )
    return runDevice(o)
  }

  const verifier = generateVerifier()
  const challenge = challengeS256(verifier)
  const state = generateState()
  const deviceName = o.deviceName ?? defaultDeviceName()

  let loop
  try {
    loop = await startLoopback({ state, timeoutMs: o.loopbackTimeoutMs })
  } catch (err) {
    if (err instanceof LoginError && err.code === 'no_port') {
      o.print('No free loopback port (9100-9199); using the device flow.')
      return runDevice(o)
    }
    throw err
  }

  const url = buildAuthorizeUrl({
    webUrl: o.webUrl,
    port: loop.port,
    state,
    challenge,
    deviceName,
    scope: o.scope ?? 'read',
  })
  const opened = await o.openBrowser(url)
  if (!opened) {
    loop.close()
    o.print('Could not open a browser; using the device flow.')
    return runDevice(o)
  }
  o.print('Opened your browser to authorize this device. Waiting for approval (120 s)...')

  const { code } = await loop.result
  return exchangeCode({
    apiUrl: o.apiUrl,
    code,
    verifier,
    redirectUri: loop.redirectUri,
    state,
    fetch: o.fetch,
  })
}
