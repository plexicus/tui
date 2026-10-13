import type { Config } from '../services/config.js'

export function deriveWebUrl(config: Pick<Config, 'serverUrl' | 'webUrl'>): string | null {
  if (config.webUrl) return config.webUrl.replace(/\/$/, '')
  // Strip `api.` subdomain: https://api.app.plexicus.ai → https://app.plexicus.ai
  // Does NOT work for IP:port deployments — returns null to signal "must configure explicitly"
  const match = config.serverUrl.match(/^(https?:\/\/)api\.(.+)$/)
  if (!match) return null
  return `${match[1]}${match[2]}`.replace(/\/$/, '')
}

// Default WebSocket base derived from the REST URL: same host, ws/wss scheme (an http:// server
// must not be upgraded to wss://).
export function deriveWsUrl(serverUrl: string, wsUrl?: string): string {
  if (wsUrl) return wsUrl.replace(/\/$/, '')
  return serverUrl.replace(/\/$/, '').replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://')
}
