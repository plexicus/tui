import { PlexicusApi } from '../services/plexicusApi.js'
import { saveCredential, envToken } from '../services/auth/credentials.js'
import { interactiveLogin, type LoginMode } from '../services/auth/login.js'
import { CredentialStore } from '../services/auth/keychain.js'
import type { FetchFn, TokenResponse } from '../services/auth/oauthClient.js'
import { canOpenBrowser as defaultCanOpenBrowser } from '../utils/canOpenBrowser.js'
import { openBrowser as defaultOpenBrowser } from '../utils/openBrowser.js'
import { deriveWebUrl } from '../utils/url.js'
import type { Config } from '../services/config.js'

export interface LoginDeps {
  store?: CredentialStore
  fetch?: FetchFn
  canOpenBrowser?: () => boolean
  openBrowser?: (url: string) => Promise<boolean>
  print?: (line: string) => void
  warn?: (line: string) => void
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  loopbackTimeoutMs?: number
  env?: NodeJS.ProcessEnv
}

export interface LoginOutcome {
  token: string
  email: string | null
  backend: string
}

/**
 * `plexicus login [--device]`: interactive OAuth-style login (loopback + PKCE by default, device
 * flow on request or when no browser can be opened). The minted token goes straight to the keychain;
 * it is never printed.
 */
export async function runLogin(
  config: Pick<Config, 'serverUrl' | 'webUrl'>,
  opts: { device?: boolean } = {},
  deps: LoginDeps = {},
): Promise<LoginOutcome> {
  const print = deps.print ?? ((l: string) => console.log(l))
  const warn = deps.warn ?? ((l: string) => console.warn(l))
  const mode: LoginMode = opts.device ? 'device' : 'auto'

  const tokenResponse: TokenResponse = await interactiveLogin({
    apiUrl: config.serverUrl,
    webUrl: deriveWebUrl(config),
    mode,
    canOpenBrowser: (deps.canOpenBrowser ?? defaultCanOpenBrowser)(),
    openBrowser: deps.openBrowser ?? defaultOpenBrowser,
    print,
    fetch: deps.fetch,
    loopbackTimeoutMs: deps.loopbackTimeoutMs,
    sleep: deps.sleep,
    now: deps.now,
  })

  // Store first: the token was minted with the user's consent and must not be lost to a lookup error.
  const saved = await saveCredential(config.serverUrl, tokenResponse.access_token, deps.store)
  if (saved.warning) warn(saved.warning)

  let email: string | null = null
  try {
    const user = await new PlexicusApi({ baseUrl: config.serverUrl, token: tokenResponse.access_token }).getSession()
    email = user.email
  } catch {
    // Display only; the token is already stored.
  }
  if (envToken(deps.env)) {
    warn('Note: PLEXICUS_TOKEN is set in your environment and takes precedence over the stored login.')
  }
  return { token: tokenResponse.access_token, email, backend: saved.backend }
}
