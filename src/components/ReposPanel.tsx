import React, { useState, useCallback, useMemo } from 'react'
import { Box, Text } from 'ink'
import { useAppState } from '../state/AppState.js'
import { useKeymap } from '../hooks/useKeymap.js'
import { useRepos } from '../hooks/useRepos.js'
import { FuzzyPicker } from './design-system/FuzzyPicker.js'
import { Spinner } from './design-system/Spinner.js'
import { SCMConnectFlow } from './SCMConnectFlow.js'
import { accent } from '../utils/theme.js'
import type { Repository } from '../types.js'

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}

interface FindingCounts { critical: number; high: number; medium: number; low: number }

function CountBadge({ counts, inverse }: { counts: FindingCounts; inverse?: boolean }) {
  return (
    <Text>
      <Text color="red" inverse={inverse}>{String(counts.critical).padStart(3) + ' '}</Text>
      <Text color="yellow" inverse={inverse}>{String(counts.high).padStart(3) + ' '}</Text>
      <Text color="cyan" inverse={inverse}>{String(counts.medium).padStart(3) + ' '}</Text>
      <Text dimColor={!inverse} inverse={inverse}>{String(counts.low).padStart(3) + ' '}</Text>
    </Text>
  )
}

export function ReposPanel() {
  const { state, dispatch } = useAppState()
  const ac = accent(state.theme)
  const { repos, loading } = useRepos()
  const [cursorIndex, setCursorIndex] = useState(0)

  const totalItems = repos.length + 1

  const allCounts = useMemo<FindingCounts>(() => repos.reduce(
    (acc, r) => ({
      critical: acc.critical + r.finding_counts.critical,
      high: acc.high + r.finding_counts.high,
      medium: acc.medium + r.finding_counts.medium,
      low: acc.low + r.finding_counts.low,
    }),
    { critical: 0, high: 0, medium: 0, low: 0 },
  ), [repos])

  const handleDown = useCallback(() => {
    setCursorIndex(i => Math.min(i + 1, totalItems - 1))
  }, [totalItems])

  const handleUp = useCallback(() => {
    setCursorIndex(i => Math.max(i - 1, 0))
  }, [])

  const handleGG = useCallback(() => {
    setCursorIndex(0)
  }, [])

  const handleShiftG = useCallback(() => {
    setCursorIndex(totalItems - 1)
  }, [totalItems])

  const handleSelect = useCallback(() => {
    const repoId = cursorIndex === 0 ? null : (repos[cursorIndex - 1]?.id ?? null)
    dispatch({ type: 'repo/select', payload: repoId })
    dispatch({
      type: 'findings/filter',
      payload: repoId ? { repository_ids: [repoId] } : {},
    })
    dispatch({ type: 'nav/pushScreen', payload: 'findings' })
  }, [repos, cursorIndex, dispatch])

  const handleAdd = useCallback(() => {
    dispatch({ type: 'scm/open' })
  }, [dispatch])

  useKeymap(
    { onDown: handleDown, onUp: handleUp, onGG: handleGG, onShiftG: handleShiftG, onSelect: handleSelect, onAdd: handleAdd },
    { inputMode: state.inputMode, isActive: state.screen === 'repos' },
  )

  if (state.fuzzyOpen && state.screen === 'repos') {
    return (
      <FuzzyPicker
        items={repos}
        getLabel={(r: Repository) => `${r.nickname} — ${r.uri}`}
        onSelect={r => {
          dispatch({ type: 'repo/select', payload: r.id })
          dispatch({ type: 'findings/filter', payload: { repository_ids: [r.id] } })
          dispatch({ type: 'ui/setFuzzyOpen', payload: false })
          dispatch({ type: 'nav/pushScreen', payload: 'findings' })
        }}
        onCancel={() => dispatch({ type: 'ui/setFuzzyOpen', payload: false })}
        placeholder="Search repositories..."
        accentColor={ac}
      />
    )
  }

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Spinner label="Loading repositories..." />
      </Box>
    )
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Column headers */}
      <Box paddingX={1}>
        <Box width={24}><Text bold dimColor>Repository</Text></Box>
        <Box flexGrow={1}><Text bold dimColor>URI</Text></Box>
        <Box width={10}><Text bold dimColor>SCM</Text></Box>
        <Box width={20}><Text bold dimColor>  C   H   M   L </Text></Box>
      </Box>

      {/* "All Repos" virtual row */}
      {(() => {
        const isSelected = cursorIndex === 0
        return (
          <Box paddingX={1}>
            <Box width={24}>
              <Text bold={isSelected} inverse={isSelected} color={isSelected ? undefined : ac}>
                {' All Repos'}
              </Text>
            </Box>
            <Box flexGrow={1}>
              <Text inverse={isSelected} dimColor={!isSelected}>-</Text>
            </Box>
            <Box width={10}>
              <Text inverse={isSelected} dimColor={!isSelected}>-</Text>
            </Box>
            <Box width={20}>
              <CountBadge counts={allCounts} inverse={isSelected} />
            </Box>
          </Box>
        )
      })()}

      {repos.map((repo, i) => {
        const isSelected = i + 1 === cursorIndex
        return (
          <Box key={repo.id} paddingX={1}>
            <Box width={24}>
              <Text bold={isSelected} inverse={isSelected}>
                {truncate(repo.nickname, 23)}
              </Text>
            </Box>
            <Box flexGrow={1}>
              <Text dimColor={!isSelected} inverse={isSelected}>{truncate(repo.uri, 35)}</Text>
            </Box>
            <Box width={10}>
              <Text dimColor={!isSelected} inverse={isSelected}>{repo.source_control}</Text>
            </Box>
            <Box width={20}>
              <CountBadge
                counts={{
                  critical: repo.finding_counts.critical,
                  high: repo.finding_counts.high,
                  medium: repo.finding_counts.medium,
                  low: repo.finding_counts.low,
                }}
                inverse={isSelected}
              />
            </Box>
          </Box>
        )
      })}

      <Box paddingX={1} marginTop={1}>
        <Text dimColor>[Enter]open  [a]add repo  [/]search  [?]help</Text>
      </Box>

      {state.scmFlowOpen && (
        <SCMConnectFlow onClose={() => dispatch({ type: 'scm/close' })} />
      )}
    </Box>
  )
}
