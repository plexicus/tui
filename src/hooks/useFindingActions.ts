import { useCallback } from 'react'
import { useAppState } from '../state/AppState.js'
import { createApiClient } from '../services/apiClient.js'
import { friendlyError } from '../utils/errors.js'
import type { Finding } from '../types.js'

export function useFindingActions() {
  const { state, dispatch } = useAppState()

  const suppress = useCallback(async (finding: Finding) => {
    try {
      const api = await createApiClient(state.token)
      await api.markMitigated(finding.id)
      dispatch({ type: 'findings/update', payload: { ...finding, status: 'mitigated' as const } })
    } catch (err) {
      dispatch({ type: 'ui/setError', payload: friendlyError(err, 'Failed to suppress finding') })
    }
  }, [state.token, dispatch])

  const toggleFalsePositive = useCallback(async (finding: Finding) => {
    try {
      const api = await createApiClient(state.token)
      await api.toggleFalsePositive(finding.id)
      dispatch({ type: 'findings/update', payload: { ...finding, is_false_positive: !finding.is_false_positive } })
    } catch (err) {
      dispatch({ type: 'ui/setError', payload: friendlyError(err, 'Failed to toggle false positive') })
    }
  }, [state.token, dispatch])

  return { suppress, toggleFalsePositive }
}
