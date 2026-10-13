import { PlexicusApi } from '../services/plexicusApi.js'
import { accountFor, clearCredential, envToken } from '../services/auth/credentials.js'
import { CredentialStore } from '../services/auth/keychain.js'
import { friendlyError, PlexicusAuthError } from '../utils/errors.js'
import type { Config } from '../services/config.js'

export interface LogoutDeps {
  store?: CredentialStore
  /** Calls DELETE /users/me/api-tokens/self with `token`; injectable for tests. */
  revoke?: (serverUrl: string, token: string) => Promise<void>
  env?: NodeJS.ProcessEnv
}

export interface LogoutResult {
  /** 'none' = nothing was stored; 'revoked' = server confirmed; 'already-invalid' = 401; 'failed' = server call failed. */
  server: 'none' | 'revoked' | 'already-invalid' | 'failed'
  clearedLocal: boolean
  messages: string[]
  exitCode: 0
}

const REVOKE_HINT = 'Revoke it in the web app under Settings -> API tokens.'

/**
 * Logout per AUTH-API-CONTRACT: revoke the calling API token on the server, then delete the
 * keychain item and the file fallback. A server failure never blocks the local cleanup.
 */
export async function runLogout(config: Pick<Config, 'serverUrl'>, deps: LogoutDeps = {}): Promise<LogoutResult> {
  const store = deps.store ?? new CredentialStore()
  const account = accountFor(config.serverUrl)
  const stored = await store.get(account)
  const messages: string[] = []

  if (!stored) {
    messages.push('Not logged in (no stored token).')
    if (envToken(deps.env)) {
      messages.push('PLEXICUS_TOKEN is set in your environment; unset it to stop using that token. It is not stored by plexicus.')
    }
    return { server: 'none', clearedLocal: false, messages, exitCode: 0 }
  }

  const revoke =
    deps.revoke ??
    (async (serverUrl: string, token: string) => {
      await new PlexicusApi({ baseUrl: serverUrl, token }).logout()
    })

  let server: LogoutResult['server'] = 'revoked'
  try {
    await revoke(config.serverUrl, stored.token)
  } catch (err) {
    if (err instanceof PlexicusAuthError) {
      server = 'already-invalid'
    } else {
      server = 'failed'
      messages.push(`Could not revoke the token on the server (${friendlyError(err, 'request failed')}).`)
    }
  }

  await clearCredential(config.serverUrl, store)

  if (server === 'failed') {
    messages.push(`The token was removed from this machine but may still be valid. ${REVOKE_HINT}`)
  } else if (server === 'already-invalid') {
    messages.push('Logged out. The token was already invalid on the server; it was removed from this machine.')
  } else {
    messages.push('Logged out. The token was revoked on the server and removed from this machine.')
  }
  if (envToken(deps.env)) {
    messages.push('PLEXICUS_TOKEN is still set in your environment; unset it to stop using that token.')
  }
  return { server, clearedLocal: true, messages, exitCode: 0 }
}
