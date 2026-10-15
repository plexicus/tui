import { describe, it, expect } from 'bun:test'
import { stat, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CredentialStore, osBackend } from '../../src/services/auth/keychain.js'
import { DUMMY_TOKEN, fakeExec, withTempHome } from './helpers.js'

const ACCOUNT = 'https://api.test.example'

describe('keychain adapter selection', () => {
  it.each([
    ['darwin', 'macos-keychain'],
    ['linux', 'libsecret'],
    ['win32', 'windows-credential-manager'],
  ] as const)('%s uses %s', (platform, kind) => {
    expect(osBackend(fakeExec().exec, platform)!.kind).toBe(kind)
  })

  it('has no OS backend on other platforms', () => {
    expect(osBackend(fakeExec().exec, 'freebsd')).toBeNull()
  })
})

describe('CredentialStore', () => {
  it('macOS: stores through `security -i` on stdin, never on argv', async () => {
    await withTempHome(async home => {
      const f = fakeExec()
      const store = new CredentialStore({ exec: f.exec, platform: 'darwin', configDir: join(home, '.config', 'plexicus') })
      const res = await store.set(ACCOUNT, DUMMY_TOKEN)
      expect(res.backend).toBe('macos-keychain')
      expect(res.warning).toBeUndefined()
      const write = f.calls.find(c => c.args[0] === '-i')!
      expect(write.opts.input).toContain(DUMMY_TOKEN)
      for (const c of f.calls) expect(c.args.join(' ')).not.toContain(DUMMY_TOKEN)
      expect(await store.get(ACCOUNT)).toEqual({ token: DUMMY_TOKEN, backend: 'macos-keychain' })
    })
  })

  it('Linux: libsecret reads the secret from stdin', async () => {
    await withTempHome(async home => {
      const f = fakeExec()
      const store = new CredentialStore({ exec: f.exec, platform: 'linux', configDir: join(home, 'c') })
      const res = await store.set(ACCOUNT, DUMMY_TOKEN)
      expect(res.backend).toBe('libsecret')
      const call = f.calls.find(c => c.args[0] === 'store')!
      expect(call.opts.input).toBe(DUMMY_TOKEN)
      expect(call.args.join(' ')).not.toContain(DUMMY_TOKEN)
      expect((await store.get(ACCOUNT))?.token).toBe(DUMMY_TOKEN)
    })
  })

  it('Windows: PowerShell receives the secret through the child environment, not argv', async () => {
    await withTempHome(async home => {
      const f = fakeExec()
      const store = new CredentialStore({ exec: f.exec, platform: 'win32', configDir: join(home, 'c') })
      const res = await store.set(ACCOUNT, DUMMY_TOKEN)
      expect(res.backend).toBe('windows-credential-manager')
      const call = f.calls.find(c => c.opts.env?.PLEXICUS_KC_SECRET)!
      expect(call.opts.env!.PLEXICUS_KC_SECRET).toBe(DUMMY_TOKEN)
      expect(call.args.join(' ')).not.toContain(DUMMY_TOKEN)
      expect((await store.get(ACCOUNT))?.token).toBe(DUMMY_TOKEN)
    })
  })

  it('falls back to a 0600 file with a visible warning when the keychain tool is missing', async () => {
    await withTempHome(async home => {
      const dir = join(home, '.config', 'plexicus')
      const f = fakeExec({ missing: ['secret-tool'] })
      const store = new CredentialStore({ exec: f.exec, platform: 'linux', configDir: dir })
      const res = await store.set(ACCOUNT, DUMMY_TOKEN)
      expect(res.backend).toBe('file')
      expect(res.warning).toContain('OS keychain unavailable')
      expect(res.warning).toContain(join(dir, 'credentials.json'))
      expect(res.warning).not.toContain(DUMMY_TOKEN)
      const st = await stat(join(dir, 'credentials.json'))
      expect(st.mode & 0o777).toBe(0o600)
      expect((await stat(dir)).mode & 0o777).toBe(0o700)
      expect(await store.get(ACCOUNT)).toEqual({ token: DUMMY_TOKEN, backend: 'file' })
    })
  })

  it('falls back to the file (with the reason) when the keychain write itself fails', async () => {
    await withTempHome(async home => {
      const f = fakeExec({ failWrites: 'User interaction is not allowed.' })
      const store = new CredentialStore({ exec: f.exec, platform: 'darwin', configDir: join(home, 'c') })
      const res = await store.set(ACCOUNT, DUMMY_TOKEN)
      expect(res.backend).toBe('file')
      expect(res.warning).toContain('User interaction is not allowed')
    })
  })

  it('prefers the keychain on read and drops a stale file copy after a keychain write', async () => {
    await withTempHome(async home => {
      const dir = join(home, 'c')
      // an earlier run had to use the file
      const offline = new CredentialStore({ exec: fakeExec({ missing: ['security'] }).exec, platform: 'darwin', configDir: dir })
      await offline.set(ACCOUNT, DUMMY_TOKEN + 'old')
      const f = fakeExec()
      const store = new CredentialStore({ exec: f.exec, platform: 'darwin', configDir: dir })
      expect((await store.get(ACCOUNT))?.backend).toBe('file')
      await store.set(ACCOUNT, DUMMY_TOKEN)
      expect(await readFile(join(dir, 'credentials.json'), 'utf-8').catch(() => 'gone')).toBe('gone')
      expect(await store.get(ACCOUNT)).toEqual({ token: DUMMY_TOKEN, backend: 'macos-keychain' })
    })
  })

  it('delete clears both the keychain item and the file fallback', async () => {
    await withTempHome(async home => {
      const dir = join(home, 'c')
      await writeFile(join(home, 'x'), '')
      const f = fakeExec()
      const store = new CredentialStore({ exec: f.exec, platform: 'linux', configDir: dir })
      await store.set(ACCOUNT, DUMMY_TOKEN)
      // simulate a leftover fallback copy as well
      const fileOnly = new CredentialStore({ exec: fakeExec({ missing: ['secret-tool'] }).exec, platform: 'linux', configDir: dir })
      await fileOnly.set(ACCOUNT, DUMMY_TOKEN)
      await store.delete(ACCOUNT)
      expect(f.store.size).toBe(0)
      expect(await store.get(ACCOUNT)).toBeNull()
      expect(await fileOnly.get(ACCOUNT)).toBeNull()
    })
  })

  it('refuses to store a value with shell-significant characters', async () => {
    await withTempHome(async home => {
      const store = new CredentialStore({ exec: fakeExec().exec, platform: 'darwin', configDir: join(home, 'c') })
      await expect(store.set(ACCOUNT, 'abc"; rm -rf ~ #')).rejects.toThrow('unexpected characters')
    })
  })
})
