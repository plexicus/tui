import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { buildWsUrl, WS_ACCESS_SUBPROTOCOL, plexicusWs } from '../../src/services/websocket.js'
import { deriveWsUrl } from '../../src/utils/url.js'
import { frameFields } from '../../src/utils/wsFrame.js'

describe('buildWsUrl', () => {
  it('appends /ws/<client_id> without any query string', () => {
    expect(buildWsUrl('wss://api.app.plexicus.ai', 'c1')).toBe('wss://api.app.plexicus.ai/ws/c1')
    expect(buildWsUrl('wss://api.app.plexicus.ai/', 'c1')).toBe('wss://api.app.plexicus.ai/ws/c1')
  })
})

describe('deriveWsUrl', () => {
  it('maps https to wss and http to ws', () => {
    expect(deriveWsUrl('https://api.app.plexicus.ai')).toBe('wss://api.app.plexicus.ai')
    expect(deriveWsUrl('http://localhost:8085')).toBe('ws://localhost:8085')
  })
  it('prefers an explicit wsUrl', () => {
    expect(deriveWsUrl('https://api.x', 'wss://ws.x/')).toBe('wss://ws.x')
  })
})

describe('frameFields', () => {
  it('merges data{} under top-level keys', () => {
    expect(frameFields({ request_type: 'trigger-finish-repository', data: { repository_id: 'r1' } }))
      .toMatchObject({ repository_id: 'r1', request_type: 'trigger-finish-repository' })
    expect(frameFields({ repository_id: 'r2' })).toMatchObject({ repository_id: 'r2' })
  })
})

describe('PlexicusWebSocket.connect', () => {
  const RealWebSocket = globalThis.WebSocket
  let seen: { url: string; protocols: unknown } | null = null

  beforeEach(() => {
    seen = null
    class FakeWebSocket {
      static OPEN = 1
      readyState = 0
      onopen: (() => void) | null = null
      onmessage: unknown = null
      onclose: unknown = null
      onerror: unknown = null
      constructor(url: string, protocols?: unknown) { seen = { url, protocols } }
      close() {}
      send() {}
    }
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket
  })
  afterEach(() => {
    plexicusWs.disconnect()
    globalThis.WebSocket = RealWebSocket
  })

  it('sends the JWT as the access subprotocol, never in the URL', () => {
    plexicusWs.connect('wss://api.example.com', 'client-1', 'jwt.value.here')
    expect(seen!.url).toBe('wss://api.example.com/ws/client-1')
    expect(seen!.url).not.toContain('jwt.value.here')
    expect(seen!.protocols).toEqual([WS_ACCESS_SUBPROTOCOL, 'jwt.value.here'])
  })
})
