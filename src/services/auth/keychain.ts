import { spawn } from 'node:child_process'
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getConfigDir } from '../../utils/paths.js'
import { redactSecrets } from '../../utils/redact.js'

export const KEYCHAIN_SERVICE = 'plexicus-tui'

export interface ExecResult {
  code: number
  stdout: string
  stderr: string
}
export interface ExecOptions {
  /** Written to the child's stdin: secrets travel here, never on argv. */
  input?: string
  /** Extra environment for the child only (never printed). */
  env?: Record<string, string>
}
export type ExecFn = (cmd: string, args: string[], opts?: ExecOptions) => Promise<ExecResult>

/** Default executor: no shell, never rejects; a missing binary is code 127. */
export const defaultExec: ExecFn = (cmd, args, opts = {}) =>
  new Promise(resolve => {
    let settled = false
    const done = (r: ExecResult) => {
      if (!settled) {
        settled = true
        resolve(r)
      }
    }
    try {
      const child = spawn(cmd, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...(opts.env ?? {}) },
        windowsHide: true,
      })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', d => (stdout += d))
      child.stderr.on('data', d => (stderr += d))
      child.once('error', (e: NodeJS.ErrnoException) =>
        done({ code: e.code === 'ENOENT' ? 127 : 1, stdout: '', stderr: e.code ?? 'spawn error' }),
      )
      child.once('close', code => done({ code: code ?? 1, stdout, stderr }))
      child.stdin.on('error', () => {})
      child.stdin.end(opts.input ?? '')
    } catch {
      done({ code: 127, stdout: '', stderr: 'spawn failed' })
    }
  })

/** Tokens are JWTs or plxc_ style opaque strings; refuse anything that could break quoting. */
const SAFE_TOKEN = /^[A-Za-z0-9._~+\/=-]{8,8192}$/
const SAFE_ACCOUNT = /^[A-Za-z0-9._~:\/@-]{1,256}$/

export function assertStorable(token: string): void {
  if (!SAFE_TOKEN.test(token)) throw new Error('Refusing to store a token with unexpected characters.')
}

export type BackendKind = 'macos-keychain' | 'libsecret' | 'windows-credential-manager' | 'file'

export interface SecretBackend {
  readonly kind: BackendKind
  readonly label: string
  /** false when the OS facility is missing on this machine */
  available(): Promise<boolean>
  get(account: string): Promise<string | null>
  set(account: string, token: string): Promise<void>
  delete(account: string): Promise<void>
}

function failure(what: string, r: ExecResult): Error {
  return new Error(`${what} failed (exit ${r.code})${r.stderr ? `: ${redactSecrets(r.stderr.trim()).slice(0, 200)}` : ''}`)
}

// ---- macOS: `security`; the secret goes through `security -i` on stdin (not argv) ----
export function macosKeychain(exec: ExecFn): SecretBackend {
  return {
    kind: 'macos-keychain',
    label: 'macOS Keychain',
    async available() {
      return (await exec('security', ['-h'])).code !== 127
    },
    async get(account) {
      assertAccount(account)
      const r = await exec('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', account, '-w'])
      if (r.code !== 0) return null
      return r.stdout.replace(/\r?\n$/, '') || null
    },
    async set(account, token) {
      assertAccount(account)
      assertStorable(token)
      const cmd = `add-generic-password -U -s "${KEYCHAIN_SERVICE}" -a "${account}" -w "${token}"\n`
      const r = await exec('security', ['-i'], { input: cmd })
      if (r.code !== 0 || /\bSecKeychain|returned error|User interaction is not allowed/i.test(r.stderr + r.stdout)) {
        throw failure('Keychain write', r)
      }
    },
    async delete(account) {
      assertAccount(account)
      await exec('security', ['delete-generic-password', '-s', KEYCHAIN_SERVICE, '-a', account])
    },
  }
}

// ---- Linux: libsecret `secret-tool`; the secret is read from stdin ----
export function libsecret(exec: ExecFn): SecretBackend {
  return {
    kind: 'libsecret',
    label: 'Secret Service (libsecret)',
    async available() {
      return (await exec('secret-tool', ['--help'])).code !== 127
    },
    async get(account) {
      assertAccount(account)
      const r = await exec('secret-tool', ['lookup', 'service', KEYCHAIN_SERVICE, 'account', account])
      if (r.code !== 0) return null
      return r.stdout.replace(/\r?\n$/, '') || null
    },
    async set(account, token) {
      assertAccount(account)
      assertStorable(token)
      const r = await exec(
        'secret-tool',
        ['store', '--label=Plexicus TUI token', 'service', KEYCHAIN_SERVICE, 'account', account],
        { input: token },
      )
      if (r.code !== 0) throw failure('Secret Service write', r)
    },
    async delete(account) {
      assertAccount(account)
      await exec('secret-tool', ['clear', 'service', KEYCHAIN_SERVICE, 'account', account])
    },
  }
}

// ---- Windows: Credential Manager through the PasswordVault WinRT API (PowerShell).
// cmdkey can create/delete entries but cannot read a secret back, so PowerShell is used for all
// operations. Secret and account travel in the child's environment, not argv. NOT exercised on a
// real Windows host yet (see CHANGELOG): any failure falls back to the 0600 file with a warning.
const PS_PRELUDE =
  "[void][Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime];" +
  '$v=New-Object Windows.Security.Credentials.PasswordVault;'
export function windowsCredentialManager(exec: ExecFn): SecretBackend {
  const ps = (script: string, env: Record<string, string>) =>
    exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { env })
  return {
    kind: 'windows-credential-manager',
    label: 'Windows Credential Manager',
    async available() {
      return (await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'exit 0'])).code !== 127
    },
    async get(account) {
      assertAccount(account)
      const r = await ps(
        PS_PRELUDE +
          `try{$c=$v.Retrieve('${KEYCHAIN_SERVICE}',$env:PLEXICUS_KC_ACCOUNT);$c.RetrievePassword();Write-Output $c.Password}catch{exit 1}`,
        { PLEXICUS_KC_ACCOUNT: account },
      )
      if (r.code !== 0) return null
      return r.stdout.trim() || null
    },
    async set(account, token) {
      assertAccount(account)
      assertStorable(token)
      const r = await ps(
        PS_PRELUDE +
          `try{$v.Remove($v.Retrieve('${KEYCHAIN_SERVICE}',$env:PLEXICUS_KC_ACCOUNT))}catch{};` +
          `$v.Add((New-Object Windows.Security.Credentials.PasswordCredential('${KEYCHAIN_SERVICE}',$env:PLEXICUS_KC_ACCOUNT,$env:PLEXICUS_KC_SECRET)))`,
        { PLEXICUS_KC_ACCOUNT: account, PLEXICUS_KC_SECRET: token },
      )
      if (r.code !== 0) throw failure('Credential Manager write', r)
    },
    async delete(account) {
      assertAccount(account)
      await ps(
        PS_PRELUDE + `try{$v.Remove($v.Retrieve('${KEYCHAIN_SERVICE}',$env:PLEXICUS_KC_ACCOUNT))}catch{}`,
        { PLEXICUS_KC_ACCOUNT: account },
      )
    },
  }
}

function assertAccount(account: string): void {
  if (!SAFE_ACCOUNT.test(account)) throw new Error('Unexpected account name for the credential store.')
}

// ---- Fallback: ~/.config/plexicus/credentials.json, dir 0700, file 0600 ----
export function credentialsFilePath(dir: string = getConfigDir()): string {
  return join(dir, 'credentials.json')
}

export function fileBackend(dir: string = getConfigDir()): SecretBackend & { path: string } {
  const path = credentialsFilePath(dir)
  const read = async (): Promise<Record<string, string>> => {
    try {
      const j = JSON.parse(await readFile(path, 'utf-8')) as { tokens?: Record<string, string> }
      return j.tokens && typeof j.tokens === 'object' ? j.tokens : {}
    } catch {
      return {}
    }
  }
  const write = async (tokens: Record<string, string>) => {
    await mkdir(dir, { recursive: true, mode: 0o700 })
    await chmod(dir, 0o700).catch(() => {})
    if (Object.keys(tokens).length === 0) {
      await rm(path, { force: true })
      return
    }
    const tmp = `${path}.tmp`
    await writeFile(tmp, JSON.stringify({ version: 1, tokens }, null, 2), { encoding: 'utf-8', mode: 0o600 })
    await rename(tmp, path)
    await chmod(path, 0o600).catch(() => {})
  }
  return {
    path,
    kind: 'file',
    label: `file ${path}`,
    async available() {
      return true
    },
    async get(account) {
      return (await read())[account] ?? null
    },
    async set(account, token) {
      assertStorable(token)
      await write({ ...(await read()), [account]: token })
    },
    async delete(account) {
      const t = await read()
      delete t[account]
      await write(t)
    },
  }
}

export interface StoreOptions {
  exec?: ExecFn
  platform?: NodeJS.Platform
  configDir?: string
}

/** Picks the OS facility for `platform`; returns null when the platform has none. */
export function osBackend(exec: ExecFn, platform: NodeJS.Platform): SecretBackend | null {
  if (platform === 'darwin') return macosKeychain(exec)
  if (platform === 'linux') return libsecret(exec)
  if (platform === 'win32') return windowsCredentialManager(exec)
  return null
}

export interface SaveResult {
  backend: BackendKind
  /** Present when the OS keychain could not be used: show it to the user. */
  warning?: string
  path?: string
}

/**
 * Token store: OS keychain first, 0600 file fallback with a visible warning.
 * Tokens are keyed by account = API origin, so each server keeps its own.
 */
export class CredentialStore {
  private readonly os: SecretBackend | null
  private readonly file: SecretBackend & { path: string }
  private osUsable: boolean | undefined

  constructor(opts: StoreOptions = {}) {
    const exec = opts.exec ?? defaultExec
    this.os = osBackend(exec, opts.platform ?? process.platform)
    this.file = fileBackend(opts.configDir ?? getConfigDir())
  }

  private async keychain(): Promise<SecretBackend | null> {
    if (!this.os) return null
    if (this.osUsable === undefined) this.osUsable = await this.os.available()
    return this.osUsable ? this.os : null
  }

  async get(account: string): Promise<{ token: string; backend: BackendKind } | null> {
    const kc = await this.keychain()
    if (kc) {
      const t = await kc.get(account).catch(() => null)
      if (t) return { token: t, backend: kc.kind }
    }
    const f = await this.file.get(account)
    return f ? { token: f, backend: 'file' } : null
  }

  async set(account: string, token: string): Promise<SaveResult> {
    assertStorable(token)
    const kc = await this.keychain()
    let reason = this.os ? `${this.os.label} is not available on this machine` : 'no OS keychain on this platform'
    if (kc) {
      try {
        await kc.set(account, token)
        // Drop a stale fallback copy so the secret lives in one place only.
        await this.file.delete(account).catch(() => {})
        return { backend: kc.kind }
      } catch (err) {
        reason = err instanceof Error ? err.message : String(err)
      }
    }
    await this.file.set(account, token)
    return {
      backend: 'file',
      path: this.file.path,
      warning: `OS keychain unavailable (${reason}). The token was stored in ${this.file.path} (mode 0600).`,
    }
  }

  async delete(account: string): Promise<void> {
    const kc = await this.keychain()
    if (kc) await kc.delete(account).catch(() => {})
    await this.file.delete(account).catch(() => {})
  }
}
