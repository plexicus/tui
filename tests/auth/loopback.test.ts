import { describe, it, expect, afterEach } from 'bun:test'
import { createServer, request as httpRequest } from 'node:http'
import { startLoopback, type LoopbackHandle } from '../../src/services/auth/loopback.js'
import { LoginError } from '../../src/services/auth/errors.js'

const STATE = 'state-0123456789abcdef'
let handle: LoopbackHandle | undefined
const base = 21100 // keeps clear of 9100-9199 so a developer's real login is not disturbed

afterEach(() => {
  handle?.close()
  handle = undefined
})

const get = (path: string, init?: RequestInit) => fetch(`http://127.0.0.1:${handle!.port}${path}`, init)

describe('loopback receiver', () => {
  it('binds 127.0.0.1 in the configured range and reports the redirect URI', async () => {
    handle = await startLoopback({ state: STATE, portMin: base, portMax: base + 9 })
    expect(handle.port).toBeGreaterThanOrEqual(base)
    expect(handle.redirectUri).toBe(`http://127.0.0.1:${handle.port}/callback`)
  })

  it('skips busy ports', async () => {
    const blocker = createServer()
    await new Promise<void>(r => blocker.listen(base + 20, '127.0.0.1', () => r()))
    try {
      handle = await startLoopback({ state: STATE, portMin: base + 20, portMax: base + 25 })
      expect(handle.port).toBe(base + 21)
    } finally {
      blocker.close()
    }
  })

  it('fails with no_port when the whole range is busy', async () => {
    const blocker = createServer()
    await new Promise<void>(r => blocker.listen(base + 30, '127.0.0.1', () => r()))
    try {
      const err = await startLoopback({ state: STATE, portMin: base + 30, portMax: base + 30 }).catch(e => e)
      expect(err).toBeInstanceOf(LoginError)
      expect(err.code).toBe('no_port')
    } finally {
      blocker.close()
    }
  })

  it('answers 404 for any path other than /callback and 405 for non-GET', async () => {
    handle = await startLoopback({ state: STATE, portMin: base + 40, portMax: base + 49 })
    expect((await get('/')).status).toBe(404)
    expect((await get('/callback/extra?code=x&state=' + STATE)).status).toBe(404)
    expect((await get('/favicon.ico')).status).toBe(404)
    expect((await get(`/callback?code=plxc_x&state=${STATE}`, { method: 'POST' })).status).toBe(405)
  })

  it('rejects a missing or different state and does not release the code', async () => {
    handle = await startLoopback({ state: STATE, portMin: base + 50, portMax: base + 59, timeoutMs: 5000 })
    let settled = false
    handle.result.then(() => (settled = true), () => (settled = true))
    expect((await get('/callback?code=plxc_evil&state=wrong-state-0123456789')).status).toBe(400)
    expect((await get('/callback?code=plxc_evil')).status).toBe(400)
    // same length, one char off
    expect((await get(`/callback?code=plxc_evil&state=${STATE.slice(0, -1)}X`)).status).toBe(400)
    await Bun.sleep(20)
    expect(settled).toBe(false)
    // the legitimate callback still works afterwards
    expect((await get(`/callback?code=plxc_good&state=${STATE}`)).status).toBe(200)
    expect(await handle.result).toEqual({ code: 'plxc_good' })
  })

  it('is single use: the server is closed after the first valid callback', async () => {
    handle = await startLoopback({ state: STATE, portMin: base + 60, portMax: base + 69 })
    const port = handle.port
    expect((await get(`/callback?code=plxc_one&state=${STATE}`)).status).toBe(200)
    await handle.result
    await Bun.sleep(50)
    const second = await fetch(`http://127.0.0.1:${port}/callback?code=plxc_two&state=${STATE}`).catch(e => e)
    // closed listener: connection refused (or, at worst, a 404 from a draining socket)
    expect(second instanceof Response ? second.status : 'refused').not.toBe(200)
  })

  it('times out and rejects with a timeout error', async () => {
    handle = await startLoopback({ state: STATE, portMin: base + 70, portMax: base + 79, timeoutMs: 40 })
    const err = await handle.result.catch(e => e)
    expect(err).toBeInstanceOf(LoginError)
    expect(err.code).toBe('timeout')
  })

  it('maps error=access_denied on a valid state to a denied login', async () => {
    handle = await startLoopback({ state: STATE, portMin: base + 80, portMax: base + 89 })
    const res = await get(`/callback?error=access_denied&state=${STATE}`)
    expect(res.status).toBe(400)
    const err = await handle.result.catch(e => e)
    expect(err.code).toBe('access_denied')
  })

  it('rejects a request whose Host header is not the loopback address (DNS rebinding)', async () => {
    handle = await startLoopback({ state: STATE, portMin: base + 90, portMax: base + 99, timeoutMs: 2000 })
    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        { host: '127.0.0.1', port: handle!.port, path: `/callback?code=plxc_x&state=${STATE}`, headers: { Host: 'evil.example' } },
        res => {
          res.resume()
          resolve(res.statusCode ?? 0)
        },
      )
      req.on('error', reject)
      req.end()
    })
    expect(status).toBe(400)
    let settled = false
    handle.result.then(() => (settled = true), () => (settled = true))
    await Bun.sleep(20)
    expect(settled).toBe(false)
  })
})
