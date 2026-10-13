import { useEffect } from 'react'
import { useAppState } from '../state/AppState.js'
import { plexicusWs } from '../services/websocket.js'
import { RemediationSchema } from '../services/apiSchemas.js'
import type { Config } from '../services/config.js'
import { deriveWsUrl } from '../utils/url.js'
import { frameFields } from '../utils/wsFrame.js'

export function useWebSocket(config: Config) {
  const { state, dispatch } = useAppState()

  useEffect(() => {
    if (!state.isAuthenticated || !state.user?.client_id || !state.token) return

    const wsUrl = deriveWsUrl(config.serverUrl, config.wsUrl)
    const clientId = state.user.client_id
    const token = state.token

    plexicusWs.connect(wsUrl, clientId, token, (connected) => {
      dispatch({ type: 'ws/setConnected', payload: connected })
    })

    plexicusWs.on('trigger-check-repository', (raw) => {
      const msg = frameFields(raw)
      const id = String(msg.repository_id ?? msg._id ?? '')
      dispatch({
        type: 'status/open',
        payload: { type: 'repo', id, name: String(msg.repository_url ?? id), status: 'scanning', progress: 0, logs: [] },
      })
    })

    plexicusWs.on('status-repository', (raw) => {
      const msg = frameFields(raw)
      const id = String(msg.repository_id ?? msg._id ?? '')
      const logs = msg.page_console ? [String(msg.page_console)] : []
      dispatch({
        type: 'status/update',
        payload: { id, status: String(msg.status ?? ''), progress: Number(msg.percentage_complete ?? 0), logs },
      })
    })

    plexicusWs.on('trigger-finish-repository', (raw) => {
      const msg = frameFields(raw)
      const id = String(msg.repository_id ?? msg._id ?? '')
      dispatch({ type: 'status/update', payload: { id, status: 'done', progress: 100, logs: [] } })
      setTimeout(() => dispatch({ type: 'status/close' }), 2000)
    })

    plexicusWs.on('status-remediation', (msg) => {
      // Server responds with { request_type: 'status-remediation', data: { _id, processing_status, finding_id, diff, ... } }
      const raw = (msg.data as Record<string, unknown>) ?? msg
      const parsed = RemediationSchema.safeParse(raw)
      if (!parsed.success) return
      const rem = parsed.data
      dispatch({ type: 'remediation/set', payload: rem })
      if (rem.status === 'ready' || rem.status === 'error') {
        setTimeout(() => dispatch({ type: 'status/close' }), 2000)
      }
    })

    // Scan heartbeat/finalization pushed by the scan pipeline (routes/plexalyzer.py, scan_runs.py).
    plexicusWs.on('scan-progress', (raw) => {
      const msg = frameFields(raw)
      const id = String(msg.repository_id ?? '')
      if (!id) return
      dispatch({ type: 'status/update', payload: { id, status: 'scanning', progress: Number(msg.percentage_complete ?? 0), logs: [] } })
    })

    plexicusWs.on('scan-run-finalized', (raw) => {
      const id = String(frameFields(raw).repository_id ?? '')
      if (!id) return
      dispatch({ type: 'status/update', payload: { id, status: 'done', progress: 100, logs: [] } })
      setTimeout(() => dispatch({ type: 'status/close' }), 2000)
    })

    plexicusWs.on('workflow_status', (msg) => {
      if (msg.page_console !== 'remediation_generation') return
      const id = String(msg.finding_id ?? '')
      if (!id) return
      const logs = msg.message ? [String(msg.message)] : []
      dispatch({
        type: 'status/update',
        payload: { id, status: String(msg.status ?? 'pending'), progress: Number(msg.percentage_complete ?? 0), logs },
      })
    })

    return () => {
      plexicusWs.disconnect()
      dispatch({ type: 'ws/setConnected', payload: false })
    }
  }, [state.isAuthenticated, state.user?.client_id, config.serverUrl, config.wsUrl])
}
