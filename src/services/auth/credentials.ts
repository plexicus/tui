import { loadConfig, readLegacyToken, saveConfig } from '../config.js'
import { CredentialStore, type BackendKind, type SaveResult } from './keychain.js'

export type CredentialSource = 'env' | BackendKind

export interface ResolvedCredential {
  token: string
  source: CredentialSource
  /** Shown once on a TTY when PLEXICUS_TOKEN is used interactively. */
  warning?: string
}

export const ENV_TOKEN_WARNING =
  'PLEXICUS_TOKEN is set. It is meant for non-interactive use (CI, scripts); prefer `plexicus login`, which keeps a revocable token in your OS keychain.'

/** Keychain account = the API origin, so each server keeps its own token. */
export function accountFor(serverUrl: string): string {
  try {
    return new URL(serverUrl).origin
  } catch {
    return serverUrl.replace(/\/+$/, '')
  }
}

export function envToken(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const t = env.PLEXICUS_TOKEN?.trim()
  return t ? t : undefined
}

/**
 * Moves a token found in an old config.json into the keychain and removes it from the file.
 * The legacy value never wins over an existing keychain entry (that one came from the v1 login).
 */
export async function migrateLegacyToken(
  store: CredentialStore = new CredentialStore(),
): Promise<{ migrated: boolean; warning?: string }> {
  const legacy = await readLegacyToken()
  if (!legacy) return { migrated: false }
  const config = await loadConfig()
  const account = accountFor(config.serverUrl)
  let warning: string | undefined
  try {
    if (!(await store.get(account))) {
      const saved = await store.set(account, legacy)
      warning = saved.warning
    }
  } catch {
    // Could not store it anywhere safe: leave the file untouched rather than lose the token.
    return { migrated: false }
  }
  await saveConfig(config) // saveConfig never writes a token
  return { migrated: true, warning }
}

export async function resolveCredential(opts: {
  serverUrl: string
  store?: CredentialStore
  env?: NodeJS.ProcessEnv
  isTTY?: boolean
}): Promise<ResolvedCredential | null> {
  const env = envToken(opts.env)
  if (env) {
    const tty = opts.isTTY ?? Boolean(process.stdout.isTTY)
    return { token: env, source: 'env', warning: tty ? ENV_TOKEN_WARNING : undefined }
  }
  const store = opts.store ?? new CredentialStore()
  const found = await store.get(accountFor(opts.serverUrl))
  return found ? { token: found.token, source: found.backend } : null
}

export async function saveCredential(serverUrl: string, token: string, store: CredentialStore = new CredentialStore()): Promise<SaveResult> {
  return store.set(accountFor(serverUrl), token)
}

export async function clearCredential(serverUrl: string, store: CredentialStore = new CredentialStore()): Promise<void> {
  await store.delete(accountFor(serverUrl))
}
