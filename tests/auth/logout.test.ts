import { describe, it, expect } from 'bun:test'
import { join } from 'node:path'
import { runLogout } from '../../src/commands/logout.js'
import { CredentialStore } from '../../src/services/auth/keychain.js'
import { PlexicusApiError, PlexicusAuthError } from '../../src/utils/errors.js'
import { DUMMY_TOKEN, fakeExec, withTempHome } from './helpers.js'

const SERVER = 'https://api.app.plexicus.ai'

async function setup(home: string, stored = true) {
  const f = fakeExec({ store: stored ? new Map([[SERVER, DUMMY_TOKEN]]) : new Map() })
  const store = new CredentialStore({ exec: f.exec, platform: 'darwin', configDir: join(home, 'c') })
  return { f, store }
}

describe('logout', () => {
  it('calls the server first with the stored token, then clears the keychain', async () => {
    await withTempHome(async home => {
      const { f, store } = await setup(home)
      const order: string[] = []
      const res = await runLogout({ serverUrl: SERVER }, {
        store,
        env: {},
        revoke: async (url, token) => {
          order.push(`revoke ${url} ${token === DUMMY_TOKEN ? 'with-stored-token' : 'wrong'} keychain=${f.store.size}`)
        },
      })
      expect(order).toEqual([`revoke ${SERVER} with-stored-token keychain=1`])
      expect(f.store.size).toBe(0)
      expect(res.server).toBe('revoked')
      expect(res.clearedLocal).toBe(true)
    })
  })

  it('still clears local credentials and points to Settings -> API tokens when the server call fails', async () => {
    await withTempHome(async home => {
      const { f, store } = await setup(home)
      const res = await runLogout({ serverUrl: SERVER }, {
        store,
        env: {},
        revoke: async () => {
          throw new PlexicusApiError('DELETE /users/me/api-tokens/self failed: boom', 500, '/users/me/api-tokens/self')
        },
      })
      expect(res.server).toBe('failed')
      expect(res.clearedLocal).toBe(true)
      expect(f.store.size).toBe(0)
      const text = res.messages.join('\n')
      expect(text).toContain('Could not revoke the token on the server')
      expect(text).toContain('Settings -> API tokens')
      expect(text).not.toContain(DUMMY_TOKEN)
    })
  })

  it('treats 401 as "already invalid" and clears local state', async () => {
    await withTempHome(async home => {
      const { f, store } = await setup(home)
      const res = await runLogout({ serverUrl: SERVER }, {
        store,
        env: {},
        revoke: async () => {
          throw new PlexicusAuthError()
        },
      })
      expect(res.server).toBe('already-invalid')
      expect(f.store.size).toBe(0)
    })
  })

  it('does nothing (and does not call the server) when no token is stored', async () => {
    await withTempHome(async home => {
      const { store } = await setup(home, false)
      let called = false
      const res = await runLogout({ serverUrl: SERVER }, { store, env: {}, revoke: async () => void (called = true) })
      expect(called).toBe(false)
      expect(res.clearedLocal).toBe(false)
    })
  })

  it('never revokes or stores PLEXICUS_TOKEN: it only tells the user to unset it', async () => {
    await withTempHome(async home => {
      const { store } = await setup(home, false)
      const res = await runLogout({ serverUrl: SERVER }, { store, env: { PLEXICUS_TOKEN: DUMMY_TOKEN }, revoke: async () => {} })
      expect(res.messages.join('\n')).toContain('unset it')
      expect(res.messages.join('\n')).not.toContain(DUMMY_TOKEN)
    })
  })
})
