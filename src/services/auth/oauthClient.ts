import { CLIENT_HEADER, CLIENT_ID, clientHeaderValue } from '../../utils/clientInfo.js'
import { LoginError, invalidGrant, upgradeRequired } from './errors.js'

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>

export interface TokenResponse {
  access_token: string
  token_type: string
  expires_at?: string
  expires_in?: number
  token_id?: string
  name?: string
  scope?: string
}

export interface DeviceAuthorization {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

interface OAuthBody {
  error?: string
  error_description?: string
  [k: string]: unknown
}

export const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code'

function form(params: Record<string, string>): string {
  return new URLSearchParams(params).toString()
}

async function post(fetchFn: FetchFn, apiUrl: string, path: string, params: Record<string, string>) {
  let res: Response
  try {
    res = await fetchFn(`${apiUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        [CLIENT_HEADER]: clientHeaderValue(),
      },
      body: form(params),
    })
  } catch {
    // The message deliberately omits the URL and body: they can carry one-time codes.
    throw new LoginError('network', `Could not reach ${apiUrl}. Check your connection and serverUrl.`)
  }
  if (res.status === 410 || res.status === 426) throw upgradeRequired()
  let body: OAuthBody = {}
  try {
    const text = await res.text()
    body = text ? (JSON.parse(text) as OAuthBody) : {}
  } catch {
    body = {}
  }
  return { status: res.status, body }
}

function validTokenResponse(body: OAuthBody): TokenResponse {
  const t = body as unknown as TokenResponse
  if (typeof t.access_token !== 'string' || !t.access_token) {
    throw new LoginError('server_error', 'The server answered without an access token. Run `plexicus login` again.')
  }
  return t
}

/** POST /auth/cli/token (authorization_code + PKCE verifier). One attempt only: the code is burned. */
export async function exchangeCode(opts: {
  apiUrl: string
  code: string
  verifier: string
  redirectUri: string
  state: string
  fetch?: FetchFn
}): Promise<TokenResponse> {
  const { status, body } = await post(opts.fetch ?? fetch, opts.apiUrl, '/auth/cli/token', {
    grant_type: 'authorization_code',
    code: opts.code,
    code_verifier: opts.verifier,
    client_id: CLIENT_ID,
    redirect_uri: opts.redirectUri,
    state: opts.state,
  })
  if (status === 200) return validTokenResponse(body)
  if (status === 400 && body.error === 'invalid_grant') throw invalidGrant()
  if (status === 429) throw new LoginError('rate_limited', 'Too many login attempts. Wait a minute and run `plexicus login` again.')
  if (status >= 500) throw new LoginError('server_error', 'The server could not complete the login. Try again later.')
  throw new LoginError('client_error', `Login was rejected (${body.error ?? `HTTP ${status}`}). Run \`plexicus login\` again.`)
}

/** POST /oauth/device_authorization (RFC 8628). */
export async function requestDeviceAuthorization(opts: {
  apiUrl: string
  deviceName: string
  scope?: string
  fetch?: FetchFn
}): Promise<DeviceAuthorization> {
  const { status, body } = await post(opts.fetch ?? fetch, opts.apiUrl, '/oauth/device_authorization', {
    client_id: CLIENT_ID,
    scope: opts.scope ?? 'read',
    device_name: opts.deviceName,
  })
  if (status === 429) throw new LoginError('rate_limited', 'Too many login attempts. Wait a minute and try again.')
  const d = body as unknown as DeviceAuthorization
  if (status !== 200 || !d.device_code || !d.user_code || !d.verification_uri) {
    throw new LoginError('server_error', 'The server does not support device login yet. Update the TUI or try again later.')
  }
  return {
    ...d,
    expires_in: Number(d.expires_in) > 0 ? Number(d.expires_in) : 600,
    interval: Number(d.interval) >= 1 ? Number(d.interval) : 5,
  }
}

export type DevicePoll =
  | { kind: 'token'; token: TokenResponse }
  | { kind: 'pending' }
  | { kind: 'slow_down' }
  | { kind: 'backoff' }

/** One POST /oauth/token poll; terminal states throw LoginError. */
export async function pollDeviceToken(opts: {
  apiUrl: string
  deviceCode: string
  fetch?: FetchFn
}): Promise<DevicePoll> {
  const { status, body } = await post(opts.fetch ?? fetch, opts.apiUrl, '/oauth/token', {
    grant_type: DEVICE_GRANT,
    device_code: opts.deviceCode,
    client_id: CLIENT_ID,
  })
  if (status === 200) return { kind: 'token', token: validTokenResponse(body) }
  if (status === 429) return { kind: 'backoff' }
  switch (body.error) {
    case 'authorization_pending':
      return { kind: 'pending' }
    case 'slow_down':
      return { kind: 'slow_down' }
    case 'access_denied':
      throw new LoginError('access_denied', 'The request was denied in the browser.')
    case 'expired_token':
      throw new LoginError('expired_token', 'The code expired. Run `plexicus login --device` again.')
    case 'invalid_grant':
      throw invalidGrant()
    default:
      if (status >= 500) throw new LoginError('server_error', 'The server could not complete the login. Try again later.')
      throw new LoginError('client_error', `Login was rejected (${body.error ?? `HTTP ${status}`}). Update the TUI and try again.`)
  }
}
