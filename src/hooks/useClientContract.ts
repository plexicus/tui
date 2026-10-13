import { useEffect } from 'react'
import { useAppState } from '../state/AppState.js'
import { createApiClient } from '../services/apiClient.js'
import { formatCreditsLine, isFeatureUnavailable } from '../services/contract.js'

const REFRESH_MS = 5 * 60_000

/**
 * Reads the optional, contract-v1 views once authenticated: the remaining-credits header and the
 * Pentests view. Each is gated on its endpoint existing: a 404/403 (older server, role without
 * access) hides it; any other failure leaves it hidden without breaking the app.
 */
export function useClientContract() {
  const { state, dispatch } = useAppState()

  useEffect(() => {
    if (!state.isAuthenticated) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const loadCredits = async () => {
      try {
        const api = await createApiClient(state.token)
        const line = formatCreditsLine(await api.getCreditsSummary())
        if (!stopped) dispatch({ type: 'contract/credits', payload: line })
        if (!stopped) timer = setTimeout(loadCredits, REFRESH_MS)
      } catch (err) {
        if (stopped) return
        dispatch({ type: 'contract/credits', payload: null })
        // transient errors retry on the next cycle; a missing/forbidden endpoint stops polling
        if (!isFeatureUnavailable(err)) timer = setTimeout(loadCredits, REFRESH_MS)
      }
    }

    const probePentests = async () => {
      try {
        const api = await createApiClient(state.token)
        await api.listPentests({ page: 1, pageSize: 1 })
        if (!stopped) dispatch({ type: 'contract/pentestsAvailable', payload: true })
      } catch {
        if (!stopped) dispatch({ type: 'contract/pentestsAvailable', payload: false })
      }
    }

    void loadCredits()
    void probePentests()
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
    }
  }, [state.isAuthenticated])
}
