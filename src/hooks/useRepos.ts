import { useEffect, useRef } from 'react'
import { useAppState } from '../state/AppState.js'
import { createApiClient } from '../services/apiClient.js'
import { friendlyError } from '../utils/errors.js'

export function useRepos() {
  const { state, dispatch } = useAppState()
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (!state.isAuthenticated) return
    if (fetchedRef.current) return
    fetchedRef.current = true

    async function fetchRepos() {
      dispatch({ type: 'repos/loading', payload: true })
      try {
        const api = await createApiClient(state.token)
        const { repos } = await api.getRepositories()
        dispatch({ type: 'repos/set', payload: repos })
      } catch (err) {
        dispatch({ type: 'repos/loading', payload: false })
        dispatch({ type: 'ui/setError', payload: friendlyError(err, 'Failed to load repos') })
      }
    }

    fetchRepos()
  }, [state.isAuthenticated])

  return {
    repos: state.repos,
    loading: state.reposLoading,
  }
}
