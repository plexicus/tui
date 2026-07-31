import React, { useCallback, useRef, useState } from 'react'
import { useAppState } from '../state/AppState.js'
import { createApiClient } from '../services/apiClient.js'
import { friendlyError } from '../utils/errors.js'
import { plexicusWs } from '../services/websocket.js'

const MOCK_MODE = process.env.MOCK_PLEXICUS === '1'
const POLL_INTERVAL_MS = 3000
const MAX_POLL_ATTEMPTS = 300  // 15 minutes at 3s intervals

export function useRemediation(findingId: string | null) {
  const { state, dispatch } = useAppState()
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [prUrl, setPrUrl] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  const trigger = useCallback(async () => {
    if (!findingId) return

    dispatch({ type: 'ui/setError', payload: null })

    if (MOCK_MODE) {
      const { mockFlowState, runMockRemediationFlow, getMockDiff } = await import('../services/mockRemediation.js')

      const flowStatus = mockFlowState.get(findingId)

      if (flowStatus === 'ready') {
        const existing = state.remediations[findingId]
        if (!existing || existing.status !== 'ready') {
          dispatch({
            type: 'remediation/set',
            payload: {
              id: `rem-${findingId}`,
              finding_id: findingId,
              status: 'ready',
              diff: getMockDiff(findingId),
              auto_create: false,
            },
          })
        }
        return
      }

      if (flowStatus === 'running') return

      dispatch({
        type: 'remediation/set',
        payload: {
          id: `rem-${findingId}`,
          finding_id: findingId,
          status: 'pending',
          diff: null,
          auto_create: false,
        },
      })

      const finding = state.findings.find(f => f.id === findingId)
      const title = finding?.title ?? findingId
      void runMockRemediationFlow(findingId, title, dispatch).then(() => {
        dispatch({
          type: 'remediation/set',
          payload: {
            id: `rem-${findingId}`,
            finding_id: findingId,
            status: 'ready',
            diff: getMockDiff(findingId),
            auto_create: false,
          },
        })
        setTimeout(() => dispatch({ type: 'status/close' }), 2000)
      })
      return
    }

    setLocalError(null)
    try {
      const api = await createApiClient(state.token)

      const existing = await api.getRemediations(findingId)
      const ready = existing.find(r => r.finding_id === findingId && r.status === 'ready')
      if (ready) {
        dispatch({ type: 'remediation/set', payload: ready })
        return
      }

      dispatch({
        type: 'remediation/set',
        payload: { id: `rem-${findingId}`, finding_id: findingId, status: 'pending', diff: null, auto_create: false },
      })
      dispatch({
        type: 'status/open',
        payload: { type: 'remediation', id: findingId, name: 'AI Remediation', status: 'pending', progress: 0, logs: [] },
      })
      await api.createRemediation(findingId)
      // Request WS push so the server notifies us when done (supplements polling)
      plexicusWs.send({ request_type: 'status-remediation', finding_id: findingId })

      let attempts = 0
      stopPolling()
      pollingRef.current = setInterval(async () => {
        attempts++
        if (attempts >= MAX_POLL_ATTEMPTS) {
          stopPolling()
          const msg = 'Remediation timed out — the server is taking too long'
          setLocalError(msg)
          dispatch({ type: 'ui/setError', payload: msg })
          return
        }

        try {
          const remediations = await api.getRemediations(findingId)
          const updated = remediations.find(r => r.finding_id === findingId)
          if (updated) {
            dispatch({ type: 'remediation/set', payload: updated })
            if (updated.status === 'ready' || updated.status === 'error') {
              stopPolling()
              if (updated.status === 'error') {
                const msg = updated.error_message ?? 'Remediation failed — check your quota or try again'
                setLocalError(msg)
                dispatch({ type: 'ui/setError', payload: msg })
              }
            }
          }
        } catch (pollErr) {
          stopPolling()
          const msg = friendlyError(pollErr, 'Failed to poll remediation status')
          setLocalError(msg)
          dispatch({ type: 'ui/setError', payload: msg })
        }
      }, POLL_INTERVAL_MS)
    } catch (err) {
      const msg = friendlyError(err, 'Failed to create remediation')
      setLocalError(msg)
      dispatch({ type: 'ui/setError', payload: msg })
    }
  }, [findingId, state.token, state.findings, state.remediations, dispatch, stopPolling])

  const applyPR = useCallback(async () => {
    if (!findingId) return
    const remediation = findingId ? state.remediations[findingId] : null
    if (!remediation || remediation.status !== 'ready') return

    if (MOCK_MODE) {
      dispatch({ type: 'status/close' })
      const finding = state.findings.find(f => f.id === findingId)
      const repo = finding?.repo_nickname ?? finding?.repo_id ?? 'repo'
      const prNum = Math.floor(Math.random() * 900) + 100
      const url = `https://github.com/plexicus/${repo}/pull/${prNum}`
      setPrUrl(url)
      dispatch({ type: 'ui/setNotification', payload: `PR #${prNum} created → ${url}` })
      return
    }

    try {
      const api = await createApiClient(state.token)
      await api.createPR(remediation.id)
      dispatch({ type: 'ui/setNotification', payload: 'PR creation triggered — check your repository' })
    } catch (err) {
      const msg = friendlyError(err, 'Failed to create PR')
      setLocalError(msg)
      dispatch({ type: 'ui/setError', payload: msg })
    }
  }, [findingId, state.remediations, state.findings, state.token, dispatch])

  React.useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  const remediation = findingId ? state.remediations[findingId] ?? null : null

  return { remediation, trigger, applyPR, stopPolling, prUrl, error: localError }
}
