import { useEffect, useRef, useMemo } from 'react'
import { useAppState } from '../state/AppState.js'
import { createApiClient } from '../services/apiClient.js'
import { severityRank } from '../utils/severity.js'
import { friendlyError } from '../utils/errors.js'
import type { Finding } from '../types.js'

function sortFindings(findings: Finding[], sortBy: string | undefined, sortDir: string | undefined): Finding[] {
  const dir = sortDir === 'asc' ? -1 : 1
  return [...findings].sort((a, b) => {
    switch (sortBy ?? 'priority') {
      case 'priority':
        return dir * ((b.prioritization_value ?? -1) - (a.prioritization_value ?? -1))
      case 'severity':
        return dir * (severityRank(b.severity) - severityRank(a.severity))
      case 'cvss':
        return dir * ((b.cvssv3_score ?? 0) - (a.cvssv3_score ?? 0))
      case 'date':
        return dir * (new Date(b.date).getTime() - new Date(a.date).getTime())
      case 'epss':
        return dir * ((b.estimated_epss ?? 0) - (a.estimated_epss ?? 0))
      default:
        return 0
    }
  })
}

export function useFindings(opts?: { cve?: string }) {
  const { state, dispatch } = useAppState()

  const repoMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const repo of state.repos) {
      map.set(repo.id, repo.nickname)
    }
    return map
  }, [state.repos])

  // Track in-flight abort controller to cancel stale requests
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!state.isAuthenticated) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    async function fetchFindings() {
      dispatch({ type: 'findings/loading', payload: true })
      try {
        const api = await createApiClient(state.token)

        const { findings, total, pageCount } = await api.getFindings(
          state.findingsFilter,
          state.findingsPage,
          repoMap.size > 0 ? repoMap : undefined,
        )

        if (controller.signal.aborted) return

        const sorted = sortFindings(findings, state.findingsFilter.sort_by, state.findingsFilter.sort_dir)
        dispatch({ type: 'findings/set', payload: sorted })
        dispatch({ type: 'findings/setPagination', payload: { total, pageCount } })

        if (opts?.cve) {
          const match = sorted.find(f => f.cve === opts.cve)
          if (match) {
            dispatch({ type: 'findings/select', payload: match.id })
          } else {
            dispatch({ type: 'ui/setError', payload: `CVE ${opts.cve} not found in findings` })
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return
        dispatch({ type: 'findings/loading', payload: false })
        dispatch({ type: 'ui/setError', payload: friendlyError(err, 'Failed to load findings') })
      }
    }

    fetchFindings()

    return () => { controller.abort() }
    // repoMap intentionally excluded: nickname enrichment refreshes on next filter/page change,
    // avoiding an extra re-fetch when repos load concurrently with the initial findings fetch.
  }, [state.isAuthenticated, state.findingsFilter, state.findingsPage])

  return {
    findings: state.findings,
    loading: state.findingsLoading,
    selectedId: state.selectedFindingId,
  }
}
