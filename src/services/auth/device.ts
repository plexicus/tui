import { LoginError } from './errors.js'
import {
  pollDeviceToken,
  requestDeviceAuthorization,
  type DeviceAuthorization,
  type FetchFn,
  type TokenResponse,
} from './oauthClient.js'

export interface DeviceLoginOptions {
  apiUrl: string
  deviceName: string
  scope?: string
  fetch?: FetchFn
  /** Prints "Open <uri> and enter <code>". */
  onPrompt: (auth: DeviceAuthorization) => void
  /** Injected so tests run on a virtual clock. */
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

const SLOW_DOWN_STEP_MS = 5_000
const RATE_LIMIT_BACKOFF_MS = 60_000
const MAX_NETWORK_FAILURES = 3

/**
 * RFC 8628 polling state machine (AUTH-API-CONTRACT.md, flow B):
 * authorization_pending -> wait `interval`; slow_down -> interval += 5 s; 429 -> wait 60 s;
 * access_denied / expired_token / invalid_grant / client errors -> stop; 410/426 -> upgrade.
 * The overall deadline is the server's `expires_in`.
 */
export async function deviceLogin(opts: DeviceLoginOptions): Promise<TokenResponse> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)))
  const now = opts.now ?? Date.now

  const auth = await requestDeviceAuthorization({
    apiUrl: opts.apiUrl,
    deviceName: opts.deviceName,
    scope: opts.scope,
    fetch: opts.fetch,
  })
  opts.onPrompt(auth)

  let intervalMs = auth.interval * 1000
  const deadline = now() + auth.expires_in * 1000
  let networkFailures = 0

  while (now() < deadline) {
    await sleep(intervalMs)
    let poll
    try {
      poll = await pollDeviceToken({ apiUrl: opts.apiUrl, deviceCode: auth.device_code, fetch: opts.fetch })
      networkFailures = 0
    } catch (err) {
      if (err instanceof LoginError && err.code === 'network' && ++networkFailures < MAX_NETWORK_FAILURES) continue
      throw err
    }
    switch (poll.kind) {
      case 'token':
        return poll.token
      case 'pending':
        break
      case 'slow_down':
        intervalMs += SLOW_DOWN_STEP_MS
        break
      case 'backoff':
        await sleep(RATE_LIMIT_BACKOFF_MS)
        break
    }
  }
  throw new LoginError('expired_token', 'The code expired. Run `plexicus login --device` again.')
}
