interface WsMessage {
  client_id?: string
  finding_id?: string
  message?: string
  name?: string
  notification_type?: string
  percentage_complete?: number
  remediation_id?: string
  status?: string
  page_console?: string
  repository_url?: string
  repository_id?: string
  request_type?: string
  processing_status?: string
  _id?: string
  [key: string]: unknown
}

type WsHandler = (msg: WsMessage) => void

// The backend (fastapi/routes/socket.py) closes any connection that puts the token in the query
// string and only accepts the JWT as the 2nd WebSocket subprotocol next to this marker, the same
// way the web app connects (frontend/composables/useWebsocketConnection.ts).
export const WS_ACCESS_SUBPROTOCOL = 'plexicus.access.jwt'
const WS_POLICY_VIOLATION = 1008 // invalid/expired token or wrong client: retrying cannot help

export function buildWsUrl(wsUrl: string, clientId: string): string {
  return `${wsUrl.replace(/\/$/, '')}/ws/${encodeURIComponent(clientId)}`
}

class PlexicusWebSocket {
  private ws: WebSocket | null = null
  private handlers = new Map<string, Set<WsHandler>>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000
  private shouldReconnect = false
  private wsUrl = ''
  private clientId = ''
  private token = ''
  private onConnectChange?: (connected: boolean) => void

  connect(wsUrl: string, clientId: string, token: string, onConnectChange?: (c: boolean) => void): void {
    this.wsUrl = wsUrl
    this.clientId = clientId
    this.token = token
    this.onConnectChange = onConnectChange
    this.shouldReconnect = true
    this.reconnectDelay = 1000
    this._connect()
  }

  private _connect(): void {
    if (!this.shouldReconnect) return
    try {
      this.ws = new WebSocket(buildWsUrl(this.wsUrl, this.clientId), [WS_ACCESS_SUBPROTOCOL, this.token])

      this.ws.onopen = () => {
        this.reconnectDelay = 1000
        this.onConnectChange?.(true)
      }

      this.ws.onmessage = (event) => {
        try {
          const msg: WsMessage = JSON.parse(String(event.data))
          const key = msg.request_type ?? msg.notification_type ?? ''
          this._dispatch(key, msg)
          this._dispatch('*', msg)
        } catch {
          // ignore parse errors
        }
      }

      this.ws.onclose = (event) => {
        this.onConnectChange?.(false)
        if (event.code === WS_POLICY_VIOLATION) this.shouldReconnect = false
        if (!this.shouldReconnect) return
        this.reconnectTimer = setTimeout(() => {
          this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000)
          this._connect()
        }, this.reconnectDelay)
      }

      this.ws.onerror = () => {
        this.ws?.close()
      }
    } catch {
      // WebSocket constructor can throw in non-browser envs; retry
      if (this.shouldReconnect) {
        this.reconnectTimer = setTimeout(() => this._connect(), this.reconnectDelay)
      }
    }
  }

  private _dispatch(key: string, msg: WsMessage): void {
    this.handlers.get(key)?.forEach(h => h(msg))
  }

  on(requestType: string, handler: WsHandler): void {
    if (!this.handlers.has(requestType)) {
      this.handlers.set(requestType, new Set())
    }
    this.handlers.get(requestType)!.add(handler)
  }

  off(requestType: string, handler: WsHandler): void {
    this.handlers.get(requestType)?.delete(handler)
  }

  send(data: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  disconnect(): void {
    this.shouldReconnect = false
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

export const plexicusWs = new PlexicusWebSocket()
