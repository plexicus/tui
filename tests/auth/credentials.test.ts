import { describe, it, expect, spyOn } from 'bun:test'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { CredentialStore } from '../../src/services/auth/keychain.js'
import { ENV_TOKEN_WARNING, migrateLegacyToken, resolveCredential } from '../../src/services/auth/credentials.js'
import { loadConfig, setConfigValue } from '../../src/services/config.js'
import { DUMMY_TOKEN, fakeExec, withTempHome } from './helpers.js'

const SERVER = 'https://api.app.plexicus.ai'

async function seedLegacy(home: string, extra: Record<string, unknown> = {}) {
  const dir = join(home, '.config', 'plexicus')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'config.json'), JSON.stringify({ serverUrl: SERVER, theme: 'dark', token: DUMMY_TOKEN, ...extra }))
  return { dir, path: join(dir, 'config.json') }
}

describe('legacy token migration', () => {
  it('moves config.token into the keychain and removes it from the file', async () => {
    await withTempHome(async home => {
      const { dir, path } = await seedLegacy(home)
      const f = fakeExec()
      const store = new CredentialStore({ exec: f.exec, platform: 'darwin', configDir: dir })
      const res = await migrateLegacyToken(store)
      expect(res.migrated).toBe(true)
      expect(f.store.get(SERVER)).toBe(DUMMY_TOKEN)
      const after = JSON.parse(await readFile(path, 'utf-8'))
      expect('token' in after).toBe(false)
      expect(after.theme).toBe('dark')
      // idempotent
      expect((await migrateLegacyToken(store)).migrated).toBe(false)
    })
  })

  it('does not overwrite an existing keychain entry with the legacy value', async () => {
    await withTempHome(async home => {
      const { dir, path } = await seedLegacy(home)
      const f = fakeExec({ store: new Map([[SERVER, 'tok.from.v1.login']]) })
      const store = new CredentialStore({ exec: f.exec, platform: 'darwin', configDir: dir })
      await migrateLegacyToken(store)
      expect(f.store.get(SERVER)).toBe('tok.from.v1.login')
      expect('token' in JSON.parse(await readFile(path, 'utf-8'))).toBe(false)
    })
  })

  it('loadConfig never returns or prints the token', async () => {
    await withTempHome(async home => {
      await seedLegacy(home)
      const spies = [spyOn(console, 'log'), spyOn(console, 'warn'), spyOn(console, 'error'), spyOn(console, 'info')]
      try {
        const config = await loadConfig()
        expect(JSON.stringify(config)).not.toContain(DUMMY_TOKEN)
        for (const s of spies) expect(JSON.stringify(s.mock.calls)).not.toContain(DUMMY_TOKEN)
      } finally {
        spies.forEach(s => s.mockRestore())
      }
    })
  })

  it('config set cannot write a token, and does not drop a legacy one silently', async () => {
    await withTempHome(async home => {
      await seedLegacy(home)
      await expect(setConfigValue('token', 'abc')).rejects.toThrow('plexicus login')
    })
  })
})

describe('resolveCredential', () => {
  it('uses PLEXICUS_TOKEN when set, warns on a TTY, and never stores it', async () => {
    await withTempHome(async home => {
      const f = fakeExec()
      const store = new CredentialStore({ exec: f.exec, platform: 'darwin', configDir: join(home, 'c') })
      const r = await resolveCredential({ serverUrl: SERVER, store, env: { PLEXICUS_TOKEN: DUMMY_TOKEN }, isTTY: true })
      expect(r).toEqual({ token: DUMMY_TOKEN, source: 'env', warning: ENV_TOKEN_WARNING })
      expect(ENV_TOKEN_WARNING).toContain('plexicus login')
      expect(ENV_TOKEN_WARNING).not.toContain(DUMMY_TOKEN)
      expect(f.store.size).toBe(0)
      expect(f.calls).toHaveLength(0)
    })
  })

  it('stays quiet without a TTY (CI)', async () => {
    const r = await resolveCredential({ serverUrl: SERVER, env: { PLEXICUS_TOKEN: DUMMY_TOKEN }, isTTY: false })
    expect(r?.warning).toBeUndefined()
  })

  it('falls back to the stored token and then to nothing', async () => {
    await withTempHome(async home => {
      const f = fakeExec({ store: new Map([[SERVER, DUMMY_TOKEN]]) })
      const store = new CredentialStore({ exec: f.exec, platform: 'darwin', configDir: join(home, 'c') })
      expect((await resolveCredential({ serverUrl: SERVER, store, env: {} }))?.source).toBe('macos-keychain')
      f.store.clear()
      expect(await resolveCredential({ serverUrl: SERVER, store, env: {} })).toBeNull()
    })
  })
})
